const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');

const client = new RDSDataClient({ region: 'ap-southeast-2' });
const resourceArn = 'arn:aws:rds:ap-southeast-2:837873138727:cluster:database-1';
const secretArn = 'arn:aws:secretsmanager:ap-southeast-2:837873138727:secret:routeplanner-db-secret-hpSdDs';

async function query(sql, parameters = [], retries = 3) {
  const command = new ExecuteStatementCommand({
    resourceArn, secretArn, database: 'postgres', sql, parameters
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
