jest.mock("./src/db", () => {
  const level = jest.requireActual("level-mem");
  return {
    db: level(
      { valueEncoding: "json" },
    ),
  }
});

jest.mock("./src/pow")
