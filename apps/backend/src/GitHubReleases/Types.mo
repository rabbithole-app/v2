import Time "mo:core/Time";

module {
  public type Release = {
    url : Text;
    htmlUrl : Text;
    id : Nat;
    tagName : Text;
    name : Text;
    body : Text;
    draft : Bool;
    prerelease : Bool;
    immutable : Bool;
    createdAt : Time.Time;
    publishedAt : ?Time.Time;
    assets : [Asset];
  };

  public type Asset = {
    url : Text;
    id : Nat;
    name : Text;
    _label : Text;
    contentType : Text;
    size : Nat;
    sha256 : ?Blob;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type SizedPointer = (Nat, Nat);
};
