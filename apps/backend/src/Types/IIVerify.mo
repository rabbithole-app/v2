module {
  /// Value format used by II for certified attribute messages.
  /// `prepare_icrc3_attributes` returns a Candid-encoded ICRC-3 `Value::Map`.
  public type Icrc3Value = {
    #Nat : Nat;
    #Int : Int;
    #Blob : Blob;
    #Text : Text;
    #Bool : Bool;
    #Array : [Icrc3Value];
    #Map : AttributeMap;
  };

  public type AttributeMap = [(Text, Icrc3Value)];

  public type VerifiedIdentityAttributes = {
    email : ?Text;
    name : ?Text;
    verifiedEmail : ?Bool;
    provider : ?Text;
  };
};
