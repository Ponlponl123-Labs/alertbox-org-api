export const streamlabs_redirect_uri =
  process.env.NODE_ENV === "production"
    ? "https://alertbox.org/app/connections/streamlabs"
    : "http://localhost:3000/app/connections/streamlabs";
