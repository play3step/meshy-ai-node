const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = 8000;
const conn = require("./db");

app.use(cors());
app.use(express.json());

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
        console.log("3D model fetch response:", objectData);

        // 특정 파일 유형들이 모두 존재하는지 확인합니다.
        if (
          objectData.model_urls &&
          objectData.model_urls.glb &&
          objectData.model_urls.fbx &&
          objectData.model_urls.usdz &&
          objectData.model_urls.obj &&
          objectData.model_urls.mtl
        ) {
          // 데이터베이스에 모델 정보를 저장합니다.
          conn.execute(
            `INSERT INTO Models (user_id, prompt, model_urls, thumbnail_url) VALUES (?, ?, ?, ?)`,
            [
              userId,
              prompt,
              JSON.stringify(objectData.model_urls),
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
