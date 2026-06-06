export default jest.fn().mockImplementation(() => {
  return {
    append: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn(),
    pipe: jest.fn(),
    pointer: jest.fn().mockReturnValue(0),
    on: jest.fn((event: string, callback: Function) => {
      if (event === 'close') callback();
    })
  };
});
export const Archiver = jest.fn();