import Runtime "mo:core/Runtime";

module {
  public func envText<system>(name : Text, fallback : Text) : Text {
    switch (Runtime.envVar<system>(name)) {
      case (?value) value;
      case null fallback;
    };
  };
};
