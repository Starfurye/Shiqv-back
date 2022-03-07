const fs = require("fs");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../util/location");
const Place = require("../models/place");
const User = require("../models/user");

const getPlaceById = async (req, res, next) => {
    const placeId = req.params.pid; // { pid: 'p1' }
    let place;

    try {
        place = await Place.findById(placeId);
    } catch (err) {
        return next(new HttpError("找不到该地点"), 500);
    }

    if (!place) {
        return next(new HttpError("没有id对应的地点", 404));
    }

    // 让mongoose在返回对象里增加一个不带下划线的'id'属性
    res.json({ place: place.toObject({ getters: true }) }); // => { place } => { place: place }
};

const getPlacesByUserId = async (req, res, next) => {
    const userId = req.params.uid;

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
        creator: req.userData.userId, // 使用不可伪造的 token
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
        return next(new HttpError("无法创建地点，请重试", 500));
    }

    res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new HttpError("不正确的输入格式，请检查输入", 422);
    }

    const { title, description } = req.body;
    const placeId = req.params.pid;

    let updatedPlace;
    try {
        updatedPlace = await Place.findById(placeId);
    } catch {
        return next(new HttpError("获取地点失败"), 500);
    }

    if (updatedPlace.creator.toString() !== req.userData.userId)
        return next(new HttpError("没有修改地点权限", 401));

    updatedPlace.title = title;
    updatedPlace.description = description;

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

    let deletedPlace;
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
