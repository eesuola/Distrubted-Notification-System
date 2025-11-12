const createResponse = (
  success,
  message,
  data,
  error,
  meta
) => {
  const response = { success, message };
  if (data !== undefined) response.data = data;
  if (error !== undefined) response.error = error;
  if (meta !== undefined) response.meta = meta;
  return response;
};

export { createResponse };