const { validateLogin, validateRegister } = require("../validators/authValidators");

function createAuthController(authService) {
  return {
    register: async (req, res) => {
      const user = await authService.register(validateRegister(req.body), {
        ip: req.ip,
      });
      res.status(201).json({ data: { user } });
    },
    login: async (req, res) => {
      const result = await authService.login(validateLogin(req.body), {
        ip: req.ip,
      });
      res.status(200).json({ data: result });
    },
    logout: async (req, res) => {
      await authService.logout({
        ...req.auth,
        userId: req.user.id,
        ip: req.ip,
      });
      res.status(204).end();
    },
    me: async (req, res) => {
      const user = await authService.getCurrentUser(req.user.id);
      res.status(200).json({ data: { user } });
    },
  };
}

module.exports = { createAuthController };
