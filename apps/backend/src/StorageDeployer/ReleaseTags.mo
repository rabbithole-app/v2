import Text "mo:core/Text";

module {
  public func version(tagName : Text) : Text {
    Text.trimStart(Text.trimStart(tagName, #text "storage-v"), #text "v");
  };
};
