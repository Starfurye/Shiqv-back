const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");

const HttpError = require("../models/http-error");
const User = require("../models/user");

const getUsers = async (req, res, next) => {
    // res.json({ users: DUMMY_USERS });
    let users = null;
    try {
        // 要求不返回密码
        users = await User.find({}, "-password");
    } catch (err) {
        return next(new HttpError("返回用户列表失败", 500));
    }
    res.json({ users: users.map((user) => user.toObject({ getters: true })) });
};

const signup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(
            new HttpError("Invalid inputs passed, please check your data.", 422)
        );
    }
    const { name, email, password } = req.body;

    // const hasUser = DUMMY_USERS.find((u) => u.email === email);
    // if (hasUser) {
    //     throw new HttpError(
    //         "Could not create user, email already exists.",
    //         422
    //     );
    // }
    let existingUser = null;
    try {
        existingUser = await User.findOne({ email: email });
    } catch {
        return next(new HttpError("注册失败"), 500);
    }

    if (existingUser) return next(new HttpError("用户已存在"), 422);

    let hashedPassword;
    try {
        hashedPassword = await bcryptjs.hash(password, 12);
    } catch {
        return next(new HttpError("无法创建用户，请重试", 500));
    }

    const createdUser = new User({
        name,
        email,
        image: req.file.path,
        password: hashedPassword,
        places: [],
    });
    try {
        await createdUser.save();
    } catch {
        return next(new HttpError("创建用户失败"), 500);
    }

    let token;
    try {
        token = jwt.sign(
            { userId: createdUser.id, email: createdUser.email },
            process.env.JWT_KEY,
            { expiresIn: "12h" }
        );
    } catch {
        return next(new HttpError("创建用户失败"), 500);
    }

    res.status(201).json({
        userId: createdUser.id,
        email: createdUser.email,
        token,
    });
};

const login = async (req, res, next) => {
    const { email, password } = req.body;

    // const identifiedUser = DUMMY_USERS.find((u) => u.email === email);
    // if (!identifiedUser || identifiedUser.password !== password) {
    //     throw new HttpError(
    //         "Could not identify user, credentials seem to be wrong.",
    //         401
    //     );
    // }
    let identifiedUser = null;
    try {
        identifiedUser = await User.findOne({ email: email });
    } catch (err) {
        return next(new HttpError("登录失败，请重试"), 500);
    }

    if (!identifiedUser) return next(new HttpError("用户名或密码错误"), 401);

    let isValidPassword = false;
    try {
        isValidPassword = await bcryptjs.compare(
            password,
            identifiedUser.password
        );
    } catch {
        return next(new HttpError("登录失败，请检查用户名或密码", 500));
    }

    if (!isValidPassword) return next("用户名或密码错误", 401);

    let token;
    try {
        token = jwt.sign(
            { userId: identifiedUser.id, email: identifiedUser.email },
            process.env.JWT_KEY,
            { expiresIn: "12h" }
        );
    } catch {
        return next(new HttpError("登录失败"), 500);
    }

    res.json({
        userId: identifiedUser.id,
        email: identifiedUser.email,
        token,
    });
};

exports.getUsers = getUsers;
exports.signup = signup;
exports.login = login;
