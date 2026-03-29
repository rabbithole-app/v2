import Nat "mo:core/Nat";
import Time "mo:core/Time";
import TID "mo:tid";

module StableTID {
  public type Store = {
    var lastTime : Nat;
    var clockId : Nat;
  };

  let MAX_CLOCK_ID : Nat = 1023; // 10 bits max (2^10 - 1)

  func nowInMicroseconds() : Nat = Nat.fromInt(Time.now()) / 1000;

  /// A generator for creating TIDs based on the current time and clock Id of 0.
  /// /// The clock ID is incremented with each call to `next()`, wrapping around
  /// /// to 0 when it exceeds the maximum value (1023).
  /// /// If the initial clock ID exceeds the maximum (1023), it will be wrapped around to fit within bounds.
  /// /// ```motoko
  /// let now = Time.now();
  /// let tidStore = StableTID.new();
  /// let tid = StableTID.next(tidStore);
  /// // tid will have current timestamp and clockId = 0
  /// ```
  public func new() : Store {
    {
      var lastTime = nowInMicroseconds(); // Convert from nanoseconds to microseconds
      var clockId : Nat = 0;
    };
  };

  public func next(self : Store) : TID.TID {
    let currentTime = nowInMicroseconds();
    if (currentTime != self.lastTime) {
      // If the time has changed, reset clockId to 0
      self.clockId := 0;
      self.lastTime := currentTime;
    };
    let nextTid = {
      timestamp = currentTime;
      clockId = self.clockId;
    };

    self.clockId += 1; // Increment clock ID
    if (self.clockId > MAX_CLOCK_ID) {
      self.clockId := 0; // Wrap around if exceeds max
    };
    nextTid;
  };
};
