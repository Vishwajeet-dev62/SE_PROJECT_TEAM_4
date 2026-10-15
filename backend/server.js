const express = require("express");
const taskRoutes = require("./routes/taskRoutes");

const app = express();
const port = process.env.PORT || 3000;

// Parse incoming JSON request bodies.
app.use(express.json());
app.use("/api/v1/tasks", taskRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Task Manager API is running!" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Task Manager API is running on port ${port}`);
  });
}

module.exports = app;
