const HttpError = require("../models/http-error");
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    if (req.method === "OPTIONS") return next();

    try {
        const token = req.headers.authorization.split(" ")[1];
        if (!token) throw new Error("验证失败");
        const decodedToken = jwt.verify(token, process.env.JWT_KEY);
        req.userData = {
            userId: decodedToken.userId,
            email: decodedToken.email,
        };
        next();
    } catch {
        return next(new HttpError("验证失败", 401));
    }
};
