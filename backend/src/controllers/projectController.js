const {
  validateMemberCreate,
  validateProjectCreate,
  validateProjectUpdate,
} = require("../validators/projectValidators");

function createProjectController(projectService) {
  return {
    list: async (req, res) => {
      res.status(200).json(await projectService.listProjects(req.user, req.query));
    },
    get: async (req, res) => {
      res.status(200).json({
        data: await projectService.getProject(req.params.id, req.user),
      });
    },
    create: async (req, res) => {
      const project = await projectService.createProject(
        validateProjectCreate(req.body),
        req.user,
      );
      res.status(201).json({ data: project });
    },
    update: async (req, res) => {
      const project = await projectService.updateProject(
        req.params.id,
        validateProjectUpdate(req.body),
        req.user,
      );
      res.status(200).json({ data: project });
    },
    archive: async (req, res) => {
      res.status(200).json({
        data: await projectService.archiveProject(req.params.id, req.user),
      });
    },
    listMembers: async (req, res) => {
      res.status(200).json(
        await projectService.listMembers(req.params.id, req.user, req.query),
      );
    },
    addMember: async (req, res) => {
      const { userId } = validateMemberCreate(req.body);
      res.status(201).json({
        data: await projectService.addMember(req.params.id, userId, req.user),
      });
    },
    removeMember: async (req, res) => {
      await projectService.removeMember(
        req.params.id,
        req.params.userId,
        req.user,
      );
      res.status(204).end();
    },
    dashboard: async (req, res) => {
      res.status(200).json({
        data: await projectService.getDashboard(req.params.id, req.user),
      });
    },
    board: async (req, res) => {
      res.status(200).json(
        await projectService.getBoard(req.params.id, req.user, req.query),
      );
    },
  };
}

module.exports = { createProjectController };
