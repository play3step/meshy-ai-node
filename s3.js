const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
require("dotenv").config();
const path = require("path"); // path 모듈을 사용하여 확장자를 다룰 수 있습니다.

const s3 = new S3Client({
  region: "ap-northeast-2", // 서울로 기입했으면 이거 기입
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET,
    key: function (요청, file, cb) {
      const ext = path.extname(file.originalname); // 파일의 확장자를 추출
      const fileName = `${Date.now().toString()}${ext}`; // 고유한 파일명에 확장자를 포함시킴
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE, // 파일의 Content-Type을 자동으로 설정
  }),
});

module.exports = upload;
