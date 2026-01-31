import Char "mo:core/Char";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Vector "mo:vector";

module Path {
  public func dirname(path : Text) : Text {
    let parts = Text.split(path, #text("/")) |> Vector.fromIter<Text>(_);
    ignore Vector.removeLast(parts);
    Text.join(Vector.vals(parts), "/");
  };

  public func basename(path : Text) : Text {
    let parts = Iter.toArray(Text.split(path, #text("/")));
    parts[parts.size() - 1];
  };

  public func join(t1 : Text, t2 : Text) : Text = if (Text.equal(t1, "")) t2 else if (Text.equal(t2, "")) t1 else t1 # "/" # t2;

  public func normalize(path : Text) : Text = Text.tokens(path, #char '/')
  |> Iter.filterMap<Text, Text>(
    _,
    func(v) {
      let name = Text.trim(v, #char ' ');
      if (Text.notEqual(name, "")) ?name else null;
    },
  )
  |> Text.join(_, "/");

  public func validateName(name : Text) : Bool {
    for (c : Char in name.chars()) {
      let isNonPrintableChar : Bool = Char.fromNat32(0x00) <= c and c <= Char.fromNat32(0x1f);
      if (isNonPrintableChar or Text.contains("<>:/|\\?*\"", #char c)) {
        return false;
      };
    };
    true;
  };
};
