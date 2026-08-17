require('dotenv').config();
const ModelGateway = require('./electron/ai/model-gateway');

async function testGroq() {
  console.log('Testing Groq API...');
  const gw = new ModelGateway();
  try {
    const start = Date.now();
    const res = await gw.structuredOutput('Say hello world', {
      type: 'object',
      properties: {
        message: { type: 'string' }
      }
    });
    console.log('Response in', Date.now() - start, 'ms');
    console.log(res);
  } catch (err) {
    console.error('Groq Error:', err);
  }
}

testGroq();
