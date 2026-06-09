import Iter "mo:core/Iter";
import Char "mo:core/Char";
import Nat "mo:core/Nat";
import Order "mo:core/Order";
import Text "mo:core/Text";
import Vector "mo:vector";

module {
  public type Identifier = {
    #Numeric : Nat;
    #Text : Text;
  };

  public type Version = {
    major : Nat;
    minor : Nat;
    patch : Nat;
    prerelease : [Identifier];
  };

  public func parse(value : Text) : ?Version {
    let (withoutBuild, build) = splitOnce(value, '+');
    switch (build) {
      case null {};
      case (?value) {
        if (Text.size(value) == 0 or not isBuildText(value)) return null;
      };
    };

    let (core, prereleaseText) = splitOnce(withoutBuild, '-');

    let parts = Text.split(core, #char '.') |> Iter.toArray(_);
    if (parts.size() != 3) return null;
    let majorText = parts[0];
    let minorText = parts[1];
    let patchText = parts[2];
    let ?major = parseCoreNumber(majorText) else return null;
    let ?minor = parseCoreNumber(minorText) else return null;
    let ?patch = parseCoreNumber(patchText) else return null;

    let prerelease = switch (prereleaseText) {
      case null [];
      case (?text) {
        if (Text.size(text) == 0) return null;
        let identifiers = Text.split(text, #char '.') |> Iter.toArray(_);
        if (identifiers.size() == 0) return null;

        let parsed = Vector.new<Identifier>();

        for (identifier in identifiers.vals()) {
          switch (parseIdentifier(identifier)) {
            case null return null;
            case (?value) Vector.add(parsed, value);
          };
        };

        Vector.toArray(parsed);
      };
    };

    ?{ major; minor; patch; prerelease };
  };

  public func compare(a : Version, b : Version) : Order.Order {
    switch (Nat.compare(a.major, b.major)) {
      case (#equal) {};
      case order return order;
    };
    switch (Nat.compare(a.minor, b.minor)) {
      case (#equal) {};
      case order return order;
    };
    switch (Nat.compare(a.patch, b.patch)) {
      case (#equal) {};
      case order return order;
    };

    comparePrerelease(a.prerelease, b.prerelease);
  };

  public func compareText(a : Text, b : Text) : Order.Order {
    switch (parse(a), parse(b)) {
      case (?left, ?right) compare(left, right);
      case (?_, null) #greater;
      case (null, ?_) #less;
      case (null, null) Text.compare(a, b);
    };
  };

  public func isStable(version : Version) : Bool {
    version.prerelease.size() == 0;
  };

  func parseCoreNumber(value : Text) : ?Nat {
    if (Text.size(value) == 0) return null;
    if (hasLeadingZero(value)) return null;
    if (not isDigits(value)) return null;
    Nat.fromText(value);
  };

  func parseIdentifier(value : Text) : ?Identifier {
    if (Text.size(value) == 0) return null;
    if (not isIdentifierText(value)) return null;

    if (isDigits(value)) {
      if (hasLeadingZero(value)) return null;
      switch (Nat.fromText(value)) {
        case (?number) ?#Numeric(number);
        case null null;
      };
    } else {
      ?#Text(value);
    };
  };

  func comparePrerelease(a : [Identifier], b : [Identifier]) : Order.Order {
    switch (a.size(), b.size()) {
      case (0, 0) return #equal;
      case (0, _) return #greater;
      case (_, 0) return #less;
      case _ {};
    };

    let limit = Nat.min(a.size(), b.size());
    var index = 0;

    while (index < limit) {
      switch (compareIdentifier(a[index], b[index])) {
        case (#equal) index += 1;
        case order return order;
      };
    };

    Nat.compare(a.size(), b.size());
  };

  func compareIdentifier(a : Identifier, b : Identifier) : Order.Order {
    switch (a, b) {
      case (#Numeric(left), #Numeric(right)) Nat.compare(left, right);
      case (#Numeric(_), #Text(_)) #less;
      case (#Text(_), #Numeric(_)) #greater;
      case (#Text(left), #Text(right)) Text.compare(left, right);
    };
  };

  func hasLeadingZero(value : Text) : Bool {
    Text.size(value) > 1 and Text.startsWith(value, #char '0');
  };

  func isDigits(value : Text) : Bool {
    if (Text.size(value) == 0) return false;
    for (char in value.chars()) {
      if (not char.isDigit()) return false;
    };
    true;
  };

  func isIdentifierText(value : Text) : Bool {
    for (char in value.chars()) {
      if (not isIdentifierChar(char)) return false;
    };
    true;
  };

  func isIdentifierChar(char : Char) : Bool {
    char.isDigit()
      or ('A' <= char and char <= 'Z')
      or ('a' <= char and char <= 'z')
      or char == '-';
  };

  func isBuildText(value : Text) : Bool {
    if (Text.size(value) == 0) return false;
    for (identifier in Text.split(value, #char '.')) {
      if (Text.size(identifier) == 0 or not isIdentifierText(identifier)) return false;
    };
    true;
  };

  func splitOnce(value : Text, separator : Char) : (Text, ?Text) {
    var left = "";
    var right = "";
    var found = false;

    for (char in value.chars()) {
      if (not found and char == separator) {
        found := true;
      } else if (found) {
        right #= Text.fromChar(char);
      } else {
        left #= Text.fromChar(char);
      };
    };

    if (found) {
      (left, ?right);
    } else {
      (left, null);
    };
  };
};
