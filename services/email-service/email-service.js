import Fastify from "fastify";
import amqp from "amqplib";
import sgMail from "@sendgrid/mail";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const fastify = Fastify({ logger: true });

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://localhost:3001";
const TEMPLATE_SERVICE_URL =
  process.env.TEMPLATE_SERVICE_URL || "http://localhost:3003";
const FROM_EMAIL = process.env.FROM_EMAIL || "hngintern@afasengineers.com";

// Set SendGrid API Key
if (!SENDGRID_API_KEY || !SENDGRID_API_KEY.startsWith("SG.")) {
  console.error(" SENDGRID_API_KEY is missing or invalid!");
  process.exit(1);
}

sgMail.setApiKey(SENDGRID_API_KEY);
console.log("SendGrid API key configured");

// Template
function fillTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

// Main email sending function
async function processEmailNotification(messageData) {
  const { notification_id, user_id, template_id, variables } = messageData;

  try {
    console.log(
      `Processing notification ${notification_id} for user ${user_id}`
    );

    //  Fetch user email from User Service
    console.log(
      ` Fetching user ${user_id} from ${USER_SERVICE_URL}/api/users/${user_id}`
    );
    const userResponse = await axios.get(
      `${USER_SERVICE_URL}/api/v1/users/${user_id}`
    );
    const userEmail = userResponse.data.data.email;
    const userName = userResponse.data.data.name || "User";

    console.log(` Sending to: ${userEmail} (${userName})`);

    // Fetch template from Template Service
    let template;
    try {
      console.log(` Fetching template ${template_id} from Template Service`);
      const templateResponse = await axios.get(
        `${TEMPLATE_SERVICE_URL}/api/v1/templates/${template_id}`
      );
      template = templateResponse.data.data;
      console.log("Template fetched from service");
    } catch (error) {
      // Fallback template
      console.log(" Template Service unavailable, using fallback template");
      template = {
        subject: "Notification from Our App",
        html_body: "<h1>Hello {{name}}</h1><p>{{message}}</p>",
      };
    }

    // variables
    const emailBody = fillTemplate(template.html_body || template.body, {
      name: userName,
      ...variables,
    });

    const emailSubject = fillTemplate(
      template.subject || "Notification",
      variables
    );

    console.log(` Prepared email - Subject: "${emailSubject}"`);

    // 4. Send email via SendGrid
    const msg = {
      to: userEmail,
      from: FROM_EMAIL,
      subject: emailSubject,
      html: emailBody,
    };

    console.log(" Sending email via SendGrid...");
    const response = await sgMail.send(msg);

    console.log(` Email sent successfully to ${userEmail}`);
    console.log(` SendGrid Response Status: ${response[0].statusCode}`);

    return { success: true, notification_id };
  } catch (error) {
    console.error(` Failed to send email:`, error.message);

    if (error.response) {
      console.error(" SendGrid Error Details:", error.response.body);
    } else {
      console.error(" Full error:", error);
    }

    throw error;
  }
}

// RabbitMQ start
async function startConsumer() {
  try {
    console.log(`🔌 Connecting to RabbitMQ at ${RABBITMQ_URL}...`);
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    const queue = "email.queue";
    const deadLetterQueue = "failed.queue";

    // Assert queues
    await channel.assertQueue(queue, { durable: true });
    await channel.assertQueue(deadLetterQueue, { durable: true });

    console.log(" Connected to RabbitMQ");
    console.log(" Email Service listening on email.queue...");

    // Consume messages
    channel.consume(
      queue,
      async (msg) => {
        if (msg !== null) {
          try {
            const messageData = JSON.parse(msg.content.toString());
            console.log("\n ===== NEW MESSAGE RECEIVED =====");
            console.log(messageData);
            console.log("===================================\n");

            await processEmailNotification(messageData);

            channel.ack(msg);
            console.log(" Message acknowledged and removed from queue\n");
          } catch (error) {
            console.error(" Processing error:", error.message);

            // Retry logic
            const retryCount =
              (msg.properties.headers?.["x-retry-count"] || 0) + 1;

            if (retryCount < 3) {
              const delaySeconds = Math.pow(2, retryCount);
              console.log(
                ` Retry attempt ${retryCount}/3 (waiting ${delaySeconds}s...)`
              );

              setTimeout(() => {
                channel.sendToQueue(queue, msg.content, {
                  headers: { "x-retry-count": retryCount },
                });
                channel.ack(msg);
              }, delaySeconds * 1000);
            } else {
              console.log(
                " Max retries reached, sending to dead letter queue\n"
              );
              channel.sendToQueue(deadLetterQueue, msg.content);
              channel.ack(msg);
            }
          }
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error(" Failed to start consumer:", error.message);
    console.error(" Make sure RabbitMQ is running: docker ps");
    process.exit(1);
  }
}

fastify.get("/health", async (request, reply) => {
  return {
    success: true,
    data: {
      status: "ok",
      service: "email-service",
      email_provider: "sendgrid",
    },
    message: "Service is healthy",
    meta: null,
  };
});

fastify.post("/test-email", async (request, reply) => {
  try {
    const { to, subject, message } = request.body;

    if (!to) {
      return reply.code(400).send({
        success: false,
        error: 'Missing "to" field',
        message: "Email address is required",
        meta: null,
      });
    }

    const msg = {
      to: to,
      from: FROM_EMAIL,
      subject: subject || "Test Email",
      html: `<h1>Test Email</h1><p>${message || "This is a test email ."}</p>`,
    };

    const response = await sgMail.send(msg);

    return {
      success: true,
      data: {
        status_code: response[0].statusCode,
        message: "Email sent via SendGrid",
      },
      message: "Test email sent successfully",
      meta: null,
    };
  } catch (error) {
    console.error("Test email error:", error.response?.body || error.message);
    return reply.code(500).send({
      success: false,
      error: error.message,
      message: "Failed to send test email",
      meta: null,
    });
  }
});

// Start the service
const start = async () => {
  try {
    // checc for health
    await fastify.listen({ port: 3004, host: "0.0.0.0" });
    console.log("\n ===================================");
    console.log(" Email Service Started Successfully");
    console.log("===================================");
    console.log(` Server: http://localhost:3004`);
    console.log(` From Email: ${FROM_EMAIL}`);
    console.log(` SendGrid: Configured`);
    console.log("===================================\n");

    // Start RabbitMQ consumer
    await startConsumer();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
