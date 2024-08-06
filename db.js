const mysql = require("mysql2");

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "Meshy",
});

connection.query("SELECT * FROM Users", (err, result) => {
  console.log(result);
});
