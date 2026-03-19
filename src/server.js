const { PORT } = require("./config/env");
const app = require("./app");

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
