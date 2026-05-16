import BackendEvents "../BackendEvents/lib";

module {
  public type LifecycleEvent = BackendEvents.StorageAccessLifecycleEvent;
  public type Envelope = BackendEvents.StorageAccessChanged;
};
