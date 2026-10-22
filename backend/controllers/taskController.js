async function getTasks(req, res) {
  return res.status(200).json({
    message: "Task controller is working!",
    tasks: [],
  });
}

module.exports = { getTasks };
