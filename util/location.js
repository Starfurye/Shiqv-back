const axios = require("axios");
const HttpError = require("../models/http-error");

// 高德地图Web服务Api
const WEB_SERVICE_API = process.env.AMAP_API_KEY;

async function getCoordsForAddress(address) {
    const response = await axios.get(
        `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(
            address
        )}&key=${WEB_SERVICE_API}`
    );
    const data = response.data;
    if (data.status === 0) throw new HttpError("找不到地址所在坐标", 422);

    const [lat, lng] = data.geocodes[0].location.split(",");
    return {
        lat: Number(lat),
        lng: Number(lng),
    };
}

module.exports = getCoordsForAddress;
