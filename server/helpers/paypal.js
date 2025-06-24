const paypal = require('@paypal/checkout-server-sdk');

// Configure PayPal environment
const configurePaypal = () => {
  const clientId = "AVEIYS8WHQPQpOnXh-Co0Cnmj7jJtIiu-Jv1yiexGEUUlpuvyG5msOesebPZZJ2v-sdpQh7R1S_QPdoe";
  const clientSecret = "ENYi28p79y4vCFEm-_MLsaW6bWqC73DAURSAfeolSEaFKcMn91iT_65NCnRthqOsGY8a4UKAAz1gQa9A";

  // Use Sandbox for testing, Live for production
  const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
  const client = new paypal.core.PayPalHttpClient(environment);

  return client;
};

module.exports = configurePaypal;