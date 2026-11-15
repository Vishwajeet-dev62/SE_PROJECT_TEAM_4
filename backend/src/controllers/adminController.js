function createAdminController(adminService) {
  return {
    createUser: async (req, res) => {
      const user = await adminService.createUser(req.user, req.body, {
        ip: req.ip,
      });
      res.status(201).json({ data: user });
    },
    listUsers: async (req, res) => {
      res.status(200).json(await adminService.listUsers(req.query));
    },
    setStatus: async (req, res) => {
      const user = await adminService.setStatus(
        req.user,
        req.params.id,
        req.body,
        { ip: req.ip },
      );
      res.status(200).json({ data: user });
    },
    setRole: async (req, res) => {
      const user = await adminService.setRole(
        req.user,
        req.params.id,
        req.body,
        { ip: req.ip },
      );
      res.status(200).json({ data: user });
    },
  };
}

module.exports = { createAdminController };
