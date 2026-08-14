const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');

const region = process.env.AWS_REGION || 'ap-southeast-2';
const client = new RDSDataClient({ region });

async function query(sql, parameters = [], retries = 3) {
  const resourceArn = process.env.DB_CLUSTER_ARN;
  const secretArn = process.env.DB_SECRET_ARN;
  const database = process.env.DB_NAME || 'postgres';
  if (!resourceArn || !secretArn) {
    throw new Error('DB_CLUSTER_ARN and DB_SECRET_ARN must be configured');
  }

  const command = new ExecuteStatementCommand({
    resourceArn, secretArn, database, sql, parameters
  });
  try {
    return await client.send(command);
  } catch (err) {
    if (err.name === 'DatabaseResumingException' && retries > 0) {
      console.log('Database resuming — waiting 10s and retrying...');
      await new Promise(r => setTimeout(r, 10000));
      return query(sql, parameters, retries - 1);
    }
    throw err;
  }
}

module.exports = { query };
