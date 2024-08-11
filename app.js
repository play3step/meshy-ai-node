const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = 8000;
const conn = require("./db");
const upload = require("./s3");

app.use(cors());
app.use(express.json());

app.post("/upload", upload.single("file"), (req, res) => {
  try {
    res.json({
      message: "파일 업로드 성공",
      fileUrl: req.file.location, // S3에 저장된 파일의 URL
    });
  } catch (error) {
    console.error("파일 업로드 중 오류 발생:", error);
    res.status(500).json({ error: "파일 업로드 실패" });
  }
});
// 다운로드 폴더 생성
const downloadDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// 파일을 다운로드하고 로컬 디렉토리에 저장하는 함수
const downloadFile = async (url, filePath) => {
  if (fs.existsSync(filePath)) {
    console.log(`File already exists: ${filePath}`);
    return path.relative(__dirname, filePath); // 절대 경로 대신 상대 경로 반환
  }

  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      console.log(`File downloaded: ${filePath}`);
      resolve(path.relative(__dirname, filePath)); // 절대 경로 대신 상대 경로 반환
    });
    writer.on("error", reject);
  });
};

const checkModelReady = async (resultId) => {
  const objectDataResponse = await axios.get(
    `https://api.meshy.ai/v2/text-to-3d/${resultId}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MESHY_KEY}`,
      },
    }
  );

  const objectData = objectDataResponse.data;

  // 특정 파일 유형들이 모두 존재하는지 확인합니다.
  if (
    objectData.model_urls &&
    objectData.model_urls.glb &&
    objectData.model_urls.fbx &&
    objectData.model_urls.usdz &&
    objectData.model_urls.obj &&
    objectData.model_urls.mtl
  ) {
    return objectData;
  }
  return null;
};

app.post("/meshy/text-to-3d", async (req, res) => {
  const { prompt, userId } = req.body;
  console.log(`Received request with prompt: ${prompt}`);

  // 클라이언트에게 초기 응답을 보냅니다.
  res.status(202).json({
    message:
      "3D model is being generated, you will be notified once it's ready.",
  });

  // 비동기적으로 모델 생성 및 데이터베이스 저장 작업을 수행합니다.
  try {
    const response = await axios.post(
      "https://api.meshy.ai/v2/text-to-3d",
      {
        mode: "preview",
        prompt: prompt,
        art_style: "realistic",
        negative_prompt: "low quality, low resolution, low poly, ugly",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MESHY_KEY}`,
        },
      }
    );

    const resultId = response.data.result;
    console.log("Generated model ID:", resultId);

    const fetchModelData = async () => {
      try {
        const objectData = await checkModelReady(resultId);

        if (objectData) {
          console.log("3D model fetch response:", objectData);

          // 모델 URL에서 파일을 다운로드하여 로컬 디렉토리에 저장
          const downloadPromises = Object.entries(objectData.model_urls).map(
            async ([key, url]) => {
              const urlObj = new URL(url);
              const filePath = path.join(
                __dirname,
                "downloads",
                `${resultId}_${key}${path.extname(urlObj.pathname)}`
              );
              const relativePath = await downloadFile(urlObj.href, filePath); // URL 전체를 사용하여 다운로드
              return [key, relativePath];
            }
          );

          const downloadedFiles = await Promise.all(downloadPromises);
          const localModelUrls = Object.fromEntries(downloadedFiles);

          // 데이터베이스에 모델 정보를 저장합니다.
          conn.execute(
            `INSERT INTO Models (user_id, prompt, model_urls, thumbnail_url) VALUES (?, ?, ?, ?)`,
            [
              userId,
              prompt,
              JSON.stringify(localModelUrls),
              objectData.thumbnail_url,
            ],
            (err, results) => {
              if (err) {
                console.error("Error inserting model into database:", err);
                return;
              }
              console.log("Model inserted successfully:", results);
            }
          );
          clearInterval(intervalId); // 조건이 충족되면 interval을 중지합니다.
        } else {
          console.log("Model URLs not ready yet. Retrying in 30 seconds...");
        }
      } catch (error) {
        console.error("Error fetching 3D model data:", error.message);
        if (error.response) {
          console.error("Fetch response data:", error.response.data);
        }
      }
    };

    const intervalId = setInterval(fetchModelData, 30000); // 30초 간격으로 결과를 조회합니다.
  } catch (error) {
    console.error("Error creating 3D model:", error.message);
    if (error.response) {
      console.error("Creation response data:", error.response.data);
    }
  }
});

app.post("/meshy/image-to-3d", async (req, res) => {
  const { imgUrl, userId } = req.body;
  console.log(`Received request with prompt: ${prompt}`);

  // 클라이언트에게 초기 응답을 보냅니다.
  res.status(202).json({
    message:
      "3D model is being generated, you will be notified once it's ready.",
  });

  // 비동기적으로 모델 생성 및 데이터베이스 저장 작업을 수행합니다.
  try {
    const response = await axios.post(
      "https://api.meshy.ai/v1/image-to-3d",
      {
        image_url: imgUrl,
        enable_pbr: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MESHY_KEY}`,
        },
      }
    );

    const resultId = response.data.result;
    console.log("Generated model ID:", resultId);

    const fetchModelData = async () => {
      try {
        const objectData = await checkModelReady(resultId);

        if (objectData) {
          console.log("3D model fetch response:", objectData);

          // 모델 URL에서 파일을 다운로드하여 로컬 디렉토리에 저장
          const downloadPromises = Object.entries(objectData.model_urls).map(
            async ([key, url]) => {
              const urlObj = new URL(url);
              const filePath = path.join(
                __dirname,
                "downloads",
                `${resultId}_${key}${path.extname(urlObj.pathname)}`
              );
              const relativePath = await downloadFile(urlObj.href, filePath); // URL 전체를 사용하여 다운로드
              return [key, relativePath];
            }
          );

          const downloadedFiles = await Promise.all(downloadPromises);
          const localModelUrls = Object.fromEntries(downloadedFiles);

          // 데이터베이스에 모델 정보를 저장합니다.
          conn.execute(
            `INSERT INTO Models (user_id, prompt, model_urls, thumbnail_url) VALUES (?, ?, ?, ?)`,
            [
              userId,
              "이미지",
              JSON.stringify(localModelUrls),
              objectData.thumbnail_url,
            ],
            (err, results) => {
              if (err) {
                console.error("Error inserting model into database:", err);
                return;
              }
              console.log("Model inserted successfully:", results);
            }
          );
          clearInterval(intervalId); // 조건이 충족되면 interval을 중지합니다.
        } else {
          console.log("Model URLs not ready yet. Retrying in 30 seconds...");
        }
      } catch (error) {
        console.error("Error fetching 3D model data:", error.message);
        if (error.response) {
          console.error("Fetch response data:", error.response.data);
        }
      }
    };

    const intervalId = setInterval(fetchModelData, 30000); // 30초 간격으로 결과를 조회합니다.
  } catch (error) {
    console.error("Error creating 3D model:", error.message);
    if (error.response) {
      console.error("Creation response data:", error.response.data);
    }
  }
});

// 로컬 디렉토리의 파일을 제공하는 라우트 설정
app.use("/downloads", express.static(path.join(__dirname, "downloads")));

app.get("/meshy/objects/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    conn.query(
      "SELECT * FROM Models WHERE user_id = ?",
      [userId],
      (err, results) => {
        if (err) {
          console.error("Error fetching user models from database:", err);
          return res
            .status(500)
            .json({ error: "Error fetching user models from database" });
        }
        // 모델 정보를 JSON 객체로 변환하여 반환
        const models = results.map((model) => ({
          ...model,
          model_urls: JSON.parse(model.model_urls),
        }));
        res.status(200).json(models);
      }
    );
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Error fetching user models" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
