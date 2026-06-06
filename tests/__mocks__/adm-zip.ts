export default jest.fn().mockImplementation(() => {
  return {
    extractAllTo: jest.fn(),
    getEntries: jest.fn().mockReturnValue([])
  };
});