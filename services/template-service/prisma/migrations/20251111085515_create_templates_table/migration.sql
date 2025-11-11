-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_template_code_language_idx" ON "templates"("template_code", "language");

-- CreateIndex
CREATE UNIQUE INDEX "templates_template_code_language_version_key" ON "templates"("template_code", "language", "version");
