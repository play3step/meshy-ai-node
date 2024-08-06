const express = require("express");

const app = express();

const meshyRouter = require("./routes/meshy");

app.use("/meshy", meshyRouter);
