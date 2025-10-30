import T "mo:encrypted-storage/Types";

module {
  public type SaveThumbnailArguments = {
    entry : T.Entry;
    thumbnail : { content : Blob; contentType : Text };
  };
};
