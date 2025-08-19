import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

async function getSecret(secretName: string): Promise<string | undefined> {
  const client = new SecretsManagerClient({
    region: "eu-west-2",
  });

  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await client.send(command);
    return response.SecretString;
  } catch (error) {
    console.error("Error retrieving secret:", error);
    throw error;
  }
}

async function main() {
  const secretName = "test";

  try {
    const secretValue = await getSecret(secretName);
    console.log("Secret retrieved successfully:");
    console.log(secretValue);
  } catch (error) {
    console.error("Failed to retrieve secret:", error);
    process.exit(1);
  }
}

main().catch(console.error);
