// --- OSPF Backend Server (Node.js / Express) ---
// Run: npm start

const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = 3001;

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
app.use(express.json());

// ---------------- Dijkstra + OSPF Core ----------------
class PriorityQueue {
  constructor() {
    this.values = [];
  }
  enqueue(element, priority) {
    this.values.push({ element, priority });
    this.values.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.values.shift();
  }
  isEmpty() {
    return this.values.length === 0;
  }
}

const loadNetworkData = () => {
  try {
    const data = fs.readFileSync("network_data.json", "utf8");
    console.log("✅ Loaded network_data.json");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Error reading network_data.json:", err.message);
    return {};
  }
};

const dijkstra = (graph, startNode) => {
  const distances = {};
  const previous = {};
  const pq = new PriorityQueue();

  if (!graph[startNode]) return { distances: {}, paths: {} };

  for (const node in graph) {
    distances[node] = node === startNode ? 0 : Infinity;
    previous[node] = null;
    pq.enqueue(node, distances[node]);
  }

  while (!pq.isEmpty()) {
    const { element: current } = pq.dequeue();

    for (const neighbor in graph[current]) {
      const newDist = distances[current] + graph[current][neighbor];
      if (newDist < distances[neighbor]) {
        distances[neighbor] = newDist;
        previous[neighbor] = current;
        pq.enqueue(neighbor, newDist);
      }
    }
  }

  return { distances, paths: previous };
};

// Generate full routing table for all nodes (SPT)
const calculateRoutingTable = (graph, startRouter) => {
  const { distances, paths } = dijkstra(graph, startRouter);
  const routingResults = {};

  for (const dest in graph) {
    if (dest === startRouter) continue;
    let nextHop = dest;
    if (distances[dest] !== Infinity) {
      let current = dest;
      while (paths[current] !== startRouter && paths[current] !== null) {
        current = paths[current];
      }
      nextHop = current;
    }
    routingResults[dest] = {
      cost: distances[dest],
      nextHop: distances[dest] === Infinity ? "Unreachable" : nextHop,
    };
  }

  // Compute all edges belonging to shortest-path tree
  const sptEdges = [];
  for (const dest in paths) {
    let cur = dest;
    while (paths[cur] && paths[cur] !== startRouter) {
      const prev = paths[cur];
      sptEdges.push([cur, prev].sort().join("-"));
      cur = prev;
    }
    if (paths[cur] === startRouter) {
      sptEdges.push([cur, startRouter].sort().join("-"));
    }
  }

  console.log(`📡 SPF Tree edges for ${startRouter}:`, [...new Set(sptEdges)]);

  return { routingResults, paths, sptEdges: [...new Set(sptEdges)], networkTopology: graph };
};

// ---------------- API ----------------
app.get("/api/calculate", (req, res) => {
  const startRouter = req.query.start;
  const graph = loadNetworkData();

  if (!startRouter || !graph[startRouter]) {
    return res.status(400).json({ error: "Invalid or missing start router ID." });
  }

  const result = calculateRoutingTable(graph, startRouter);
  console.log(`✅ SPF Tree computed for source: ${startRouter}`);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
