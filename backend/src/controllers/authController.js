const { validateLogin, validateRegister } = require("../validators/authValidators");

function createAuthController(authService) {
  return {
    register: async (req, res) => {
      const user = await authService.register(validateRegister(req.body));
      res.status(201).json({ data: { user } });
    },
    login: async (req, res) => {
      const result = await authService.login(validateLogin(req.body));
      res.status(200).json({ data: result });
    },
  };
}

module.exports = { createAuthController };
