require('dotenv').config();
const PlannerEngine = require('./electron/ai/planner');
const { ModelGateway } = require('./electron/ai/model-gateway');

const modelGateway = new ModelGateway();
const planner = new PlannerEngine(modelGateway, {});

async function test() {
  console.log("Testing: Get my latest emails");
  const res1 = await planner.understandRequest("Get my latest emails");
  console.log(JSON.stringify(res1, null, 2));
  
  console.log("\nTesting: Open YouTube and search MrBeast");
  const res2 = await planner.understandRequest("Open YouTube and search MrBeast");
  console.log(JSON.stringify(res2, null, 2));
}

test();
