# Flow: TypeScript Promise DAG Execution

Flow enables you to define type-safe Promise Directed Acyclic Graphs (DAGs) and execute them in the most efficient order.

## Installation

```bash
npm i @trytrench/flow
```

## Using Flow

Here is how you can utilize Flow in your code:

### Step 1: Initialize Node Builder

First, initialize a Node Builder with a specific `NodeInput` type:

```typescript
import { initNodeBuilder } from "@trytrench/flow";

type NodeInput = {
  timestamp: Date;
};

const nodeBuilder = initNodeBuilder.input<NodeInput>().create();
```

### Step 2: Create Nodes

Next, create the nodes. Here we create `temperatureNode` and `windSpeedNode` that fetch data asynchronously from APIs. We then create `windChillNode` that depends on `temperatureNode` and `windSpeedNode`, and calculates the wind chill factor:

```typescript
const temperatureNode = nodeBuilder
  .resolver(async ({ input }) => {
    const temperature = await fetchTemperatureFromApi(input.timestamp);
    return temperature;
  });

const windSpeedNode = nodeBuilder
  .resolver(async ({ input }) => {
    const windSpeed = await fetchWindSpeedFromApi(input.timestamp);
    return windSpeed;
  });

const windChillNode = nodeBuilder
  .depend({
    temperature: temperatureNode,
    windSpeed: windSpeedNode,
  })
  .resolver(({ deps }) => {
    const { temperature, windSpeed } = deps;
    const windChillFactor = calculateWindChill(temperature, windSpeed);
    return windChillFactor;
  });
```

### Step 3: Run Node

Finally, run the nodes. In this case, we're executing `windChillNode` and logging the returned wind chill factor:

```typescript
windChillNode
  .run({
    timestamp: new Date(),
  })
  .then((windChillFactor) => {
    console.log(`The wind chill factor is: ${windChillFactor}`);
  })
  .catch((err) => {
    console.error(err);
  });
```
