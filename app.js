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

    const resultId = JSON.stringify(response.data.result);

    // 데이터베이스에 데이터 삽입
    conn.execute(
      `INSERT INTO Models (user_id, result_id) VALUES (?, ?)`,
      [userId, resultId],
      (err, results) => {
        if (err) {
          console.error("Error inserting model into database:", err);
          return res
            .status(500)
            .json({ error: "Error inserting model into database" });
        }
        console.log("Model inserted successfully:", results);
      }
    );
  } catch (error) {
    console.error("Error creating 3D model:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      res.status(error.response.status).send(error.response.data);
    } else {
      res.status(500).send("Error creating 3D model");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
