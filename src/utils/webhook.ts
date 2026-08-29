export const webhookParser = async ({ request }: { request: Request }) => {
  const text = await request.text();
  Object.defineProperty(request, "rawBody", {
    value: text,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return JSON.parse(text);
};
