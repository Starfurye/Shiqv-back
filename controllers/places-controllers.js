const fs = require("fs");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../util/location");
const Place = require("../models/place");
const User = require("../models/user");

// let DUMMY_PLACES = [
//     {
//     "title": "龙洲塔",
//     "description": "龙游县文物古迹榜 第四名",
//     "address": "浙江省衢州市龙游县龙洲路356号",
//     "creator": "62108650beb409becd91cf99"
//      },
//     {
//     "title": "龙游石窟",
//     "description": "龙游县文物古迹榜 第一名",
//     "address": "浙江省衢州市龙游县小南海镇石岩背村",
//     "creator": "62108650beb409becd91cf99"
//      }
// ];

const getPlaceById = async (req, res, next) => {
    const placeId = req.params.pid; // { pid: 'p1' }
    let place = null;

    try {
        place = await Place.findById(placeId);
    } catch (err) {
        return next(new HttpError("找不到该地点"), 500);
    }

    if (!place) {
        return next(
            new HttpError("Could not find a place for the provided id.", 404)
        );
    }

    // 让mongoose在返回对象里增加一个不带下划线的'id'属性
    res.json({ place: place.toObject({ getters: true }) }); // => { place } => { place: place }
};

// function getPlaceById() { ... }
// const getPlaceById = function() { ... }

const getPlacesByUserId = async (req, res, next) => {
    const userId = req.params.uid;

    // const places = DUMMY_PLACES.filter((p) => {
    //     return p.creator === userId;
    // });
    let user = null;

    try {
        // 用populate('xxx')以后就能通过user.xxx访问
        user = await User.findById(userId).populate("places");
    } catch {
        return next(new HttpError("获取不到该用户的地点"), 404);
    }

    if (!user || user.places.length === 0) {
        return next(new HttpError("该用户还没有添加地点哦", 404));
    }

    res.json({
        places: user.places.map((place) => place.toObject({ getters: true })),
    });
};

const createPlace = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(
            new HttpError("Invalid inputs passed, please check your data.", 422)
        );
    }

    // const { title, description, address, creator } = req.body;
    const { title, description, address } = req.body;

    // 利用Api做地址解析
    let coordinates;
    try {
        coordinates = await getCoordsForAddress(address);
    } catch (error) {
        return next(error);
    }

    const createdPlace = new Place({
        title,
        description,
        address,
        location: coordinates,
        image: req.file.path,
        creator: req.userData.userId,
    });

    let user = null;
    try {
        user = await User.findById(req.userData.userId);
    } catch {
        return next(new HttpError("无法创建地点"), 500);
    }

    if (!user) return next(new HttpError("找不到用户"), 404);

    try {
        const session = await mongoose.startSession();
        // 开启事务
        session.startTransaction();
        await createdPlace.save({ session: session });
        user.places.push(createdPlace);
        await user.save({ session: session });
        session.commitTransaction();
    } catch (err) {
        // 异步操作不要throw，而要返回并传给下一个中间件
        return next(new HttpError("无法创建地点，请重试", 500));
    }

    // DUMMY_PLACES.push(createdPlace);

    res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new HttpError(
            "Invalid inputs passed, please check your data.",
            422
        );
    }

    const { title, description } = req.body;
    const placeId = req.params.pid;
    // const updatedPlace = { ...DUMMY_PLACES.find((p) => p.id === placeId) };
    // const placeIndex = DUMMY_PLACES.findIndex((p) => p.id === placeId);

    let updatedPlace = null;
    try {
        updatedPlace = await Place.findById(placeId);
    } catch {
        return next(new HttpError("获取地点失败"), 500);
    }

    if (updatedPlace.creator.toString() !== req.userData.userId)
        return next(new HttpError("没有修改地点权限", 401));

    updatedPlace.title = title;
    updatedPlace.description = description;

    // DUMMY_PLACES[placeIndex] = updatedPlace;
    try {
        await updatedPlace.save();
    } catch {
        return next(new HttpError("更新地点失败"), 500);
    }

    res.status(200).json({
        updatedPlace: updatedPlace.toObject({ getters: true }),
    });
};

const deletePlace = async (req, res, next) => {
    const placeId = req.params.pid;
    // if (!DUMMY_PLACES.find((p) => p.id === placeId)) {
    //     throw new HttpError("Could not find a place for that id.", 404);
    // }
    // DUMMY_PLACES = DUMMY_PLACES.filter((p) => p.id !== placeId);

    let deletedPlace = null;
    try {
        // populate 会调动和 model 中 ref 相关的 collection
        deletedPlace = await Place.findById(placeId).populate("creator");
    } catch {
        return next(new HttpError("获取地点失败", 500));
    }

    if (!deletedPlace) return next(new HttpError("要删除的地点不存在"), 404);

    if (deletedPlace.creator.id !== req.userData.userId)
        return next(new HttpError("没有删除地点权限", 401));

    const imagePath = deletedPlace.image;

    try {
        const session = await mongoose.startSession();
        session.startTransaction();
        deletedPlace.remove({ session: session });
        // 由于上面的populate，可以访问用户collection，并删除地点
        deletedPlace.creator.places.pull(deletedPlace);
        await deletedPlace.creator.save({ session: session });
        await session.commitTransaction();
    } catch {
        return next(new HttpError("删除地点失败", 500));
    }

    fs.unlink(imagePath, (err) => {
        console.log(err);
    });

    res.status(200).json({ message: "地点已删除" });
};

exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
