import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Order "mo:core/Order";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Nat8 "mo:core/Nat8";
import Time "mo:core/Time";

import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import Vector "mo:vector";
import CertifiedAssets "mo:certified-assets/Stable";

import T "Types";
import Migrations "Migrations/lib";
import Utils "Utils";
import FileSystem "FileSystem";
import Upload "Upload";
import ErrorMessages "ErrorMessages";
import File "FileSystem/File";
import Node "FileSystem/Node";
import Permissions "FileSystem/Permissions";
import Common "FileSystem/Common";
import Const "Const";
import Http "Http";

module EncryptedFileStorage {
  public type StableStore = T.StableStore;
  public type VersionedStableStore = T.VersionedStableStore;
  /// Creates a new versioned stable store. Called once during initial canister deployment.
  /// On subsequent upgrades, the existing stable variable is preserved and migrated
  /// via `upgradeStableStore`.
  ///
  /// Example:
  /// ```motoko
  /// stable var versionedStore = EncryptedStorage.initStableStore({
  ///   canisterId;
  ///   vetKdKeyId = keyId;
  ///   domainSeparator = "file_storage_dapp";
  ///   region = MemoryRegion.new();
  ///   rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
  ///   certs = null;
  /// });
  /// versionedStore := EncryptedStorage.upgradeStableStore(versionedStore);
  /// let storage = EncryptedStorage.fromVersion(versionedStore);
  /// ```
  public func initStableStore({ region; rootPermissions; canisterId; vetKdKeyId; domainSeparator; certs; backendId } : T.EncryptedStorageInitArgs) : T.VersionedStableStore {
    let fs = FileSystem.new({
      region;
      rootPermissions;
    });
    let upload = Upload.new(region);

    #v2({
      canisterId;
      region;
      fs;
      upload;
      staging = Map.new();
      certs = Option.get(certs, CertifiedAssets.init_stable_store());
      vetKdKeyId;
      domainSeparatorBytes = Text.encodeUtf8(domainSeparator);
      var streamingCallback = null;

      // V2 fields
      var backendId = backendId;
      var subscriptionCache = null;
      var encryptedBytesUsed = 0;
      var unreportedTrialBytes = 0;
      var cachedModuleHash = null;
      var lastCycleAlertAt = 0;
      var lastCycleAlertLevel = null;
      var cachedIdleBurnPerDay = null;
    });
  };

  /// Migrates the versioned store to the current version.
  /// Safe to call on every upgrade — if already at the latest version, returns as-is.
  /// `options.backendId` updates backendId on each upgrade (from initArgs).
  public func upgradeStableStore(store : T.VersionedStableStore, options : T.UpgradeOptions) : T.VersionedStableStore {
    Migrations.upgrade(store, options);
  };

  /// Extracts the current-version StableStore from a VersionedStableStore.
  /// Must be called after `upgradeStableStore`.
  public func fromVersion(store : T.VersionedStableStore) : T.StableStore {
    Migrations.getCurrentState(store);
  };

  /// Returns canister status summary (cycle balance filled by caller).
  public func getStatus(self : T.StableStore, cycleBalance : Nat) : T.StorageStatus {
    {
      cycleBalance;
      subscriptionStatus = switch (self.subscriptionCache) {
        case (?cache) ?cache.status;
        case null null;
      };
      encryptedBytesUsed = self.encryptedBytesUsed;
      backendId = self.backendId;
    };
  };

  /// Handles HTTP requests.
  public func httpRequest(self : T.StableStore, req : T.HttpRequest) : Result.Result<T.HttpResponse, Text> {
    Http.processHttpRequest(self, req);
  };

  /// Handles HTTP request streaming callback.
  public func httpRequestStreamingCallback(self : T.StableStore, token : T.StreamingToken) : Result.Result<T.StreamingCallbackResponse, Text> {
    Http.httpRequestStreamingCallback(self, token);
  };

  // public func store(self : T.StableStore, caller : Principal, args : T.StoreArguments) : Result.Result<(), Text> {
  //   let #File({ path; metadata = { content; sha256; contentType; size } }) = args;

  //   switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(#File, path))) {
  //     case (#ok _) {};
  //     case (#err message) return #err message;
  //   };

  //   let hash = Sha256.fromBlob(#sha256, content);

  //   switch (sha256) {
  //     case (?providedHash) {
  //       if (hash != providedHash) {
  //         return #err(ErrorMessages.sha256HashMismatch(providedHash, hash));
  //       };
  //     };
  //     case null {};
  //   };

  //   let file : T.FileMetadataStore = switch (FileSystem.create(self.fs, caller, { entry = (#File, path) })) {
  //     case (#ok { metadata = #File(file) }) file;
  //     case (#ok { metadata = #Directory(_) }) Runtime.unreachable();
  //     case (#err message) return #err message;
  //   };

  //   File.replaceContent(self.fs, file, content, hash);
  //   file.contentType := contentType;

  //   #ok;
  // };

  public func get(self : T.StableStore, caller : Principal, args : T.GetArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {
        let ?node = FileSystem.get(self.fs, #entry(args.entry)) else return #err(ErrorMessages.entryNotFound(args.entry));
        #ok(Node.getDetails(node));
      };
      case (#err message) #err message;
    };
  };

  public func getChunk(self : T.StableStore, caller : Principal, args : T.GetChunkArguments) : Result.Result<T.ChunkContent, Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    switch (FileSystem.get(self.fs, #entry(args.entry))) {
      case (?{ metadata = #File(file) }) {
        let numChunks = File.getChunksSize(file, args.version);

        if (args.chunkIndex >= numChunks) return #err("Chunk index out of bounds.");

        File.getChunk(self.fs, file, args.chunkIndex, args.version) |> #ok({
          content = Option.get<Blob>(_, "");
        });
      };
      case _ #err(ErrorMessages.entryNotFound(args.entry));
    };
  };

  func endpoint(keyId : T.KeyId, hash : Blob) : CertifiedAssets.Endpoint {
    let ?tid = Text.decodeUtf8(keyId.1) else Runtime.unreachable();
    let key = "/" # Text.join(Iter.fromArray(["encrypted", Principal.toText(keyId.0), tid]), "/");
    CertifiedAssets.Endpoint(key, null)
    // request certification is not supported in this context
    .no_request_certification()
    // the content's hash is inserted directly instead of computing it from the content
    .hash(hash).status(200);
  };

  /// Sets the streaming callback for the assets library.
  public func setStreamingCallback(self : T.StableStore, callback : T.StreamingCallback) {
    self.streamingCallback := ?callback;
  };

  /// Creates a file or directory at the specified path, creating all parent directories as needed.
  ///
  /// New files are placed in a staging area and hidden from `list()` until content is
  /// committed via `update()`. This prevents incomplete uploads from appearing in the UI.
  ///
  /// Use `#CreateNew` to create a new entry (fails if it already exists).
  /// Use `#GetOrCreate` to return an existing entry or create a new one.
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.create(storage, caller, {
  ///   entry = (#File, "dir/subdir/file.jpg");
  ///   createMode = #CreateNew;
  ///   encryptionMode = null;
  /// });
  /// ```
  public func create(self : T.StableStore, caller : Principal, args : T.CreateArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let { entry; createMode } = args;
    let (kind, _) = entry;

    // Check if file is currently in staging (incomplete upload)
    let nodeKey = entryToNodeKey(self.fs, entry);
    let inStaging = switch (nodeKey) {
      case (?nk) Map.has(self.staging, Utils.hashNodes, nk);
      case null false;
    };

    let result = switch (inStaging, FileSystem.get(self.fs, #entry(entry)), createMode, kind) {
      // File in staging with GetOrCreate → return existing node (retry upload)
      case (true, ?node, #GetOrCreate, #File) #ok(node);
      // File in staging with CreateNew → error (upload already in progress)
      case (true, _, #CreateNew, #File) #err(ErrorMessages.entryAlreadyExists(entry));
      // Normal flow: delegate to FileSystem
      case _ FileSystem.create(self.fs, caller, args);
    };

    switch (result) {
      case (#ok(node)) {
        // Mark new files in staging (not GetOrCreate on existing committed files)
        let isNewFile = kind == #File and not inStaging and createMode == #CreateNew;
        if (isNewFile) {
          let nk : T.NodeKey = (#File, node.parentId, node.name);
          ignore Map.put(self.staging, Utils.hashNodes, nk, {
            node;
            var batchId : ?T.BatchId = null;
            createdAt = Time.now();
          });
        };
        #ok(Node.getDetails(node));
      };
      case (#err msg) #err msg;
    };
  };

  /// Converts an entry path to a `NodeKey` by resolving parent directories.
  /// Returns `null` if parent directories don't exist or if the entry is a directory
  /// (staging only applies to files).
  func entryToNodeKey(fs : T.FileSystemStore, (kind, path) : T.Entry) : ?T.NodeKey {
    let dirnames = Text.split(path, #char '/') |> Vector.fromIter<Text>(_);

    // Remove empty segments
    let cleaned = Vector.new<Text>();
    for (seg in Vector.vals(dirnames)) {
      if (seg != "") Vector.add(cleaned, seg);
    };

    let filename : ?Text = if (kind == #File) Vector.removeLast(cleaned) else null;

    var parentId : ?Nat64 = null;
    for (name in Vector.vals(cleaned)) {
      let ?{ id } = Map.get(fs.nodes, Utils.hashNodes, (#Directory, parentId, name)) else return null;
      parentId := ?id;
    };

    switch (filename) {
      case (?fname) ?(#File, parentId, fname);
      case null {
        // Staging doesn't apply to directories, so we don't need to resolve directory keys
        null;
      };
    };
  };

  /// Checks if a node is in staging (incomplete upload).
  func isStaged(self : T.StableStore, node : T.NodeDetails) : Bool {
    let nodeKey : T.NodeKey = switch (node.metadata) {
      case (#File(_)) (#File, node.parentId, node.name);
      case (#Directory(_)) return false;
    };
    Map.has(self.staging, Utils.hashNodes, nodeKey);
  };

  /// Removes staging entries whose associated batch has expired/been removed,
  /// or entries without a batchId that have exceeded the expiry duration.
  /// Also removes the corresponding file nodes from the main FS.
  func cleanupExpiredStaging(self : T.StableStore) {
    let now = Time.now();
    let keysToRemove = Vector.new<T.NodeKey>();

    for ((nodeKey, staging) in Map.entries(self.staging)) {
      let shouldRemove = switch (staging.batchId) {
        // Batch was assigned — check if it still exists
        case (?batchId) switch (Upload.getBatch(self.upload, batchId)) {
          case null true;
          case _ false;
        };
        // No batch assigned — check timeout
        case null (now - staging.createdAt) > Const.BATCH_EXPIRY_DURATION;
      };
      if (shouldRemove) Vector.add(keysToRemove, nodeKey);
    };

    for (key in Vector.vals(keysToRemove)) {
      ignore Map.remove(self.staging, Utils.hashNodes, key);
      // Remove the placeholder file node from FS
      ignore FileSystem.removeNodeByKey(self.fs, key);
    };
  };

  public func listVersions(self : T.StableStore, caller : Principal, args : T.ListVersionsArguments) : Result.Result<[T.FileVersionDetails], Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };
    FileSystem.listVersions(self.fs, args.entry);
  };

  public func restoreVersion(self : T.StableStore, caller : Principal, args : T.RestoreVersionArguments) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };
    FileSystem.restoreVersion(self.fs, args.entry, args.version);
  };

  /// Updates data for a file or directory.
  /// To fully upload the file, follow these steps:
  /// 1. Create a file using the `create` method.
  /// 2. Create a batch file using `createBatch` and upload all chunks from the file using `createChunk`.
  /// 3. Complete the upload process by calling `update`.
  public func update(self : T.StableStore, caller : Principal, args : T.UpdateArguments, onEncryptedUpload : ?(Nat -> Result.Result<(), Text>)) : async* Result.Result<(), Text> {
    let entry = switch (args) {
      case (#File { path }) (#File, path);
      case (#Directory { path }) (#Directory, path);
    };
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let ?node = FileSystem.get(self.fs, #entry(entry)) else return #err(ErrorMessages.entryNotFound(entry));

    // Check if node is in staging (incomplete upload)
    let nodeKey = entryToNodeKey(self.fs, entry);

    switch (node, args) {
      case ({ keyId; metadata = #File(file) }, #File { metadata = { sha256; chunkIds; contentType } }) {
        var totalLength = 0;
        var errorMessage : ?Text = null;

        let chunkPointers = Array.map<Nat, T.SizedPointer>(
          chunkIds,
          func(chunkId : Nat) : T.SizedPointer {
            let chunkPointer = switch (Upload.getChunkPointer(self.upload, chunkId)) {
              case (?pointer) pointer;
              case (null) {
                errorMessage := ?("Chunk with id " # debug_show chunkId # " not found.");
                (0, 0);
              };
            };

            totalLength += chunkPointer.1;

            chunkPointer;
          },
        );

        switch (errorMessage) {
          case (?message) return #err message;
          case null {};
        };

        // Trial limit verification with actual totalLength
        if (file.encryptionMode == #Encrypted) {
          switch (onEncryptedUpload) {
            case (?check) switch (check(totalLength)) {
              case (#err msg) return #err msg;
              case (#ok) {};
            };
            case null {};
          };
        };

        let hash = switch (await* asyncHashChunksViaPointers(self, chunkPointers)) {
          case (#ok(hash)) hash;
          case (#err(msg)) return #err("Failed to hash chunks: " # msg); // dead section?
        };

        switch (sha256) {
          case (?providedHash) {
            if (hash != providedHash) {
              return #err(ErrorMessages.sha256HashMismatch(providedHash, hash));
            };
          };
          case null {};
        };

        // Materialize chunks before addVersion (avoid lazy iterator + dealloc issue)
        let chunks = Array.map<T.SizedPointer, Blob>(
          chunkPointers,
          func(address : Nat, size : Nat) : Blob = MemoryRegion.loadBlob(self.upload.region, address, size),
        );

        File.addVersion(self.fs, file, chunks.vals(), totalLength, hash, contentType);
        CertifiedAssets.certify(self.certs, endpoint(keyId, hash));

        // Track encrypted bytes for trial limit (cumulative — not decreased on delete)
        if (file.encryptionMode == #Encrypted) {
          self.encryptedBytesUsed += totalLength;
          self.unreportedTrialBytes += totalLength;
        };

        // Remove staging marker — file upload is now complete
        switch (nodeKey) {
          case (?nk) ignore Map.remove(self.staging, Utils.hashNodes, nk);
          case null {};
        };

        #ok;
      };
      case ({ metadata = #Directory(dir) }, #Directory { metadata }) {
        dir.color := metadata.color;
        #ok;
      };
      case _ Runtime.unreachable();
    };
  };

  ///LINK - https://github.com/NatLabs/ic-assets/blob/53515e5c1372846c918911aa665f8df0cbdde2e1/src/BaseAssets/AssetUtils.mo#L558-L603
  func asyncHashChunksViaPointers(self : T.StableStore, chunkPointers : [(Nat, Nat)]) : async* Result.Result<Blob, Text> {
    // need to make multiple async calls to hash the content
    // to bypass the 40B instruction limit

    // From the Sha256 benchmarks we know that hashing 1MB of data uses about 320M instructions
    // So we can safely hash about 60MB of data before we hit the 40B instruction limit
    // Assuming each chunk is less than 2MB (the suggested transfer limit for the IC), we can hash
    // 60 in a single call

    let pointers = Vector.new<T.SizedPointer>();
    let hashSections = Vector.new<[T.SizedPointer]>();

    var accumulatedSize = 0;
    var i = 0;

    for (chunkPointer in chunkPointers.vals()) {
      Vector.add(pointers, chunkPointer);
      accumulatedSize += chunkPointer.1;
      i += 1;

      if (accumulatedSize > Const.MAX_HASHING_BYTES_PER_CALL) {
        accumulatedSize := chunkPointer.1;
        Vector.add(hashSections, Vector.toArray(pointers));
        Vector.clear(pointers);
      };

      if (i == chunkPointers.size()) {
        Vector.add(hashSections, Vector.toArray(pointers));
        Vector.clear(pointers);
      };
    };

    let sha256 = Sha256.Digest(#sha256);

    for (hashSection in Vector.vals(hashSections)) {
      await hashChunksSection(self, sha256, hashSection);
    };

    #ok(sha256.sum());
  };

  func hashChunksSection(self : T.StableStore, sha256 : Sha256.Digest, chunkPointers : [(Nat, Nat)]) : async () {
    for ((address, size) in chunkPointers.vals()) {
      let chunk = MemoryRegion.loadBlob(self.upload.region, address, size);

      sha256.writeBlob(chunk);
    };
  };

  /// Deletes a file or directory.
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.delete(storage, caller, { entry = #File("dir/subdir/file.jpg"); recursive = false });
  /// switch (result) {
  ///   case (#ok) {
  ///     // the file was deleted successfully
  ///   };
  ///   case (#err message) return #err message;
  /// };
  /// ```
  ///
  /// To delete a non-empty directory, it must be called with the argument `recursive = true`
  public func delete(self : T.StableStore, caller : Principal, args : T.DeleteArguments) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    switch (FileSystem.delete(self.fs, args)) {
      case (#ok(?{ metadata = #File(file) })) File.deallocateAll(self.fs, file);
      case (#err(message)) return #err message;
      case _ {};
    };

    #ok;
  };

  /// Creates a batch for subsequent linking of chunks of the file
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.createBatch(storage, caller, { entry = #File("dir/subdir/file.jpg") });
  /// let batchId = switch (result) {
  ///   case (#ok { batchId }) batchId;
  ///   case (#err message) return #err message;
  /// };
  /// // next, we are already uploading chunks using this `batchId`
  /// // let chunkId = switch (EncryptedStorage.createChunk(storage, caller, { batchId; content = blobContent })) {
  /// //   case (#ok { chunkId }) chunkId;
  /// //   case (#err message) return #err message;
  /// // };
  /// ```
  public func createBatch(self : T.StableStore, caller : Principal, args : T.CreateBatchArguments, onEncryptedUpload : ?(Nat -> Result.Result<(), Text>)) : Result.Result<T.CreateBatchResponse, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    // Trial limit pre-check for encrypted files (before uploading chunks)
    let nodeKey = entryToNodeKey(self.fs, args.entry);
    let isEncrypted = switch (nodeKey) {
      case (?nk) switch (Map.get(self.staging, Utils.hashNodes, nk)) {
        case (?{ node = { metadata = #File(fileMeta) } }) fileMeta.encryptionMode == #Encrypted;
        case _ false;
      };
      case null false;
    };

    if (isEncrypted) {
      switch (onEncryptedUpload) {
        case (?check) switch (check(args.totalSize)) {
          case (#err msg) return #err msg;
          case (#ok) {};
        };
        case null {};
      };
    };

    // Cleanup expired staging entries
    cleanupExpiredStaging(self);

    let result = Upload.createBatch(self.upload, caller);

    // Bind staging entry to the newly created batch
    switch (result) {
      case (#ok { batchId }) {
        let nodeKey = entryToNodeKey(self.fs, args.entry);
        switch (nodeKey) {
          case (?nk) switch (Map.get(self.staging, Utils.hashNodes, nk)) {
            case (?staging) staging.batchId := ?batchId;
            case null {};
          };
          case null {};
        };
      };
      case _ {};
    };

    result;
  };

  /// Creates a chunk
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.createChunk(storage, caller, { batchId; content = blobContent });
  /// let chunkId = switch (result) {
  ///   case (#ok { chunkId }) chunkId;
  ///   case (#err message) return #err message;
  /// };
  /// // after uploading all the chunks of the file, you can call the `update` method and attach the chunks to the already created file.
  /// ```
  public func createChunk(self : T.StableStore, caller : Principal, args : T.Chunk, onEncryptedUpload : ?(Nat -> Result.Result<(), Text>)) : Result.Result<T.CreateChunkResponse, Text> {
    // Gate check before writing chunk to memory region
    if (isEncryptedBatch(self, args.batchId)) {
      let batchBytes = switch (Upload.getBatch(self.upload, args.batchId)) {
        case (?batch) batch.totalBytes;
        case null 0;
      };
      switch (onEncryptedUpload) {
        case (?check) switch (check(batchBytes + args.content.size())) {
          case (#err msg) return #err msg;
          case (#ok) {};
        };
        case null {};
      };
    };
    Upload.createChunk(self.upload, caller, args);
  };

  /// Reverse lookup: find if a batch belongs to an encrypted file via staging entries.
  func isEncryptedBatch(self : T.StableStore, batchId : T.BatchId) : Bool {
    for ((_, staging) in Map.entries(self.staging)) {
      if (staging.batchId == ?batchId) {
        let #File(fileMeta) = staging.node.metadata else return false;
        return fileMeta.encryptionMode == #Encrypted;
      };
    };
    false;
  };

  /// Move directories and files from one location to another. The method also recursively merges folders and files, replacing existing files and combining access rights.
  ///
  /// Example:
  /// ```motoko
  /// // before
  /// // .
  /// // ├─Documents
  /// // │ └─Books
  /// // │   └─book.pdf
  /// // └─Photos
  ///
  /// switch (EncryptedStorage.move(storage, caller, { entry = #Directory("Documents/Books"); target = null })) {
  ///   case (#ok _) {};
  ///   case (#err message) return #err message;
  /// };
  /// // after
  /// // .
  /// // ├─Documents
  /// // ├─Books
  /// // │ └─book.pdf
  /// // └─Photos
  /// ```
  public func move(self : T.StableStore, caller : Principal, args : T.MoveArguments) : Result.Result<(), Text> {
    let target = switch (args.target) {
      case (?entry) #entry(entry);
      case null #root;
    };
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry)), Permissions.ensureUserCanWrite(self.fs, caller, target)) {
      case (#ok _, #ok _) {};
      case (#err message, #ok _) return #err("Source error: " # message);
      case (_, #err message) return #err("Target error: " # message);
    };

    FileSystem.move(self.fs, args.entry, args.target);
  };

  /// Renames an entry (file or directory) without moving it
  public func rename(self : T.StableStore, caller : Principal, args : T.RenameArguments) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    FileSystem.rename(self.fs, args.entry, args.newName);
  };

  /// Clears the current storage
  public func clear(self : T.StableStore, caller : Principal) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #root)) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    FileSystem.clear(self.fs);
    Map.clear(self.staging);
    CertifiedAssets.clear(self.certs);

    #ok();
  };

  public func hasPermission(self : T.StableStore, caller : T.Caller, args : T.HasPermissionArguments) : Bool {
    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, args.entry)) {
      case (#ok v) v;
      case (#err _) return false;
    };

    switch (Permissions.getUserRights(self.fs, caller, findBy, args.user)) {
      case (#err _ or #ok null) false;
      case (#ok(?rights)) not Order.isLess(Utils.permissionCompare(rights, args.permission));
    };
  };

  /// Grants or modifies access rights for a user to a given entry.
  /// Only the file owner or a user with management rights can perform this action.
  /// The file owner cannot change their own rights.
  public func grantPermission(self : T.StableStore, caller : T.Caller, args : T.GrantPermissionArguments, onShareGate : ?(() -> Result.Result<(), Text>)) : Result.Result<(), Text> {
    // Subscription gate: sharing requires active/trial
    switch (onShareGate) {
      case (?check) switch (check()) {
        case (#err msg) return #err msg;
        case (#ok) {};
      };
      case null {};
    };

    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, args.entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };
    Permissions.setUserRights(self.fs, caller, findBy, args.user, args.permission);
  };

  /// Revokes a user's access to a shared file.
  /// The file owner cannot remove their own access.
  /// Only the file owner or a user with management rights can perform this action.
  public func revokePermission(self : T.StableStore, caller : T.Caller, args : T.RevokePermissionArguments) : Result.Result<(), Text> {
    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, args.entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };
    Permissions.removeUserRights(self.fs, caller, findBy, args.user);
  };

  func nodeKeyFromDetails(node : T.NodeDetails) : T.NodeKey {
    switch (node.metadata) {
      case (#File _) (#File, node.parentId, node.name);
      case (#Directory _) (#Directory, node.parentId, node.name);
    };
  };

  func getCallerPermission(fs : T.FileSystemStore, caller : Principal, node : T.NodeDetails) : ?T.Permission {
    Permissions.getMaxPermission(fs, caller, #nodeKey(nodeKeyFromDetails(node)), null);
  };

  func setCallerPermission(nodes : [T.NodeDetails], permission : ?T.Permission) : [T.NodeDetails] {
    Array.map<T.NodeDetails, T.NodeDetails>(nodes, func(node) = { node with callerPermission = permission });
  };

  func enrichSharing(fs : T.FileSystemStore, nodes : [T.NodeDetails]) : [T.NodeDetails] {
    let { hashNodes } = Utils;
    Array.map<T.NodeDetails, T.NodeDetails>(
      nodes,
      func(node) {
        let nodeKey = nodeKeyFromDetails(node);
        let count = switch (Map.get(fs.nodes, hashNodes, nodeKey)) {
          case (?raw) Map.size(raw.permissions);
          case null 0;
        };
        { node with sharing = if (count > 0) ?{ sharedWith = count } else null };
      },
    );
  };

  /// Returns a list of directories and files by the specified entry.
  /// If the user does not have the right to read the directory, it returns an array with the elements to which the user has the right to read.
  /// Each node is enriched with the caller's effective permission (callerPermission).
  /// The response also includes the caller's permission on the listed directory (directoryPermission).
  public func list(self : T.StableStore, caller : Principal, entry : ?T.Entry) : Result.Result<T.ListResponse, Text> {
    let dirFindBy = switch (FileSystem.getFilterByFromEntry(self.fs, entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };
    let directoryPermission = Permissions.getMaxPermission(self.fs, caller, dirFindBy, null);
    let canRead = directoryPermission != null;

    // Special case: when the caller cannot read the root directory,
    // we still want to show top-level directories leading to permitted resources
    // (e.g. show `Shared` if the caller has access to something under it).
    if (entry == null and not canRead) {
      let nat64hash : Map.HashUtils<Nat64> = (Map.hashNat64, Nat64.equal);

      let reachableRoots = Vector.new<T.NodeStore>();
      let seenRootIds = Map.new<Nat64, ()>();
      for (node in Map.vals(self.fs.nodes)) {
        if (Permissions.ensureUserCanRead(self.fs, caller, #keyId(node.keyId)) |> Result.isOk(_)) {
          let rootNode = Common.findRootAncestor(self.fs, node);
          if (Map.get(seenRootIds, nat64hash, rootNode.id) == null) {
            ignore Map.put(seenRootIds, nat64hash, rootNode.id, ());
            Vector.add(reachableRoots, rootNode);
          };
        };
      };

      let sortedRoots = Array.sort(Vector.toArray(reachableRoots), func(a, b) = Text.compare(a.name, b.name));
      let details = Array.map(sortedRoots, Node.getDetails);
      let entries = Array.map<T.NodeDetails, T.NodeDetails>(
        details,
        func(node) = { node with callerPermission = getCallerPermission(self.fs, caller, node) },
      );
      return #ok({ entries; directoryPermission });
    };

    let parentId = switch (entry) {
      case (?v) {
        let ?{ id } = FileSystem.get(self.fs, #entry(v)) else return #ok({
          entries = [];
          directoryPermission;
        });
        ?id;
      };
      case null null;
    };
    let { phash } = Map;
    let rawNodes = FileSystem.listByParentId(self.fs, parentId);
    let allItems = Array.map(rawNodes, Node.getDetails);
    // Filter out staged (incomplete upload) files
    let items = Array.filter(allItems, func(node : T.NodeDetails) : Bool = not isStaged(self, node));

    if (not canRead) {
      // Check if caller can read the node directly OR has access to any descendant
      func hasReachableDescendant(nodeId : Nat64) : Bool {
        for (child in Map.vals(self.fs.nodes)) {
          if (child.parentId == ?nodeId) {
            if (Permissions.ensureUserCanRead(self.fs, caller, #keyId(child.keyId)) |> Result.isOk(_)) {
              return true;
            };
            // Recurse into directories
            switch (child.metadata) {
              case (#Directory _) if (hasReachableDescendant(child.id)) return true;
              case _ {};
            };
          };
        };
        false;
      };

      let filtered = Array.filter(
        items,
        func(node) {
          // Direct access
          if (Permissions.ensureUserCanRead(self.fs, caller, #nodeKey(nodeKeyFromDetails(node))) |> Result.isOk(_)) {
            return true;
          };
          // Or has reachable descendant (for directories)
          switch (node.metadata) {
            case (#Directory _) hasReachableDescendant(node.id);
            case _ false;
          };
        },
      );
      let entries = Array.map<T.NodeDetails, T.NodeDetails>(
        filtered,
        func(node) = { node with callerPermission = getCallerPermission(self.fs, caller, node) },
      );
      return #ok({ entries; directoryPermission });
    };

    // Optimization: check if any child has direct permission overrides for the caller
    // Uses raw NodeStore (which has permissions map) since NodeDetails no longer exposes it
    let hasChildOverrides = Option.isSome(
      Array.find<T.NodeStore>(
        rawNodes,
        func(node) {
          Map.has(node.permissions, phash, caller)
          or Map.has(node.permissions, phash, Principal.anonymous());
        },
      ),
    );

    let entries = if (not hasChildOverrides) {
      // Fast path: all children inherit directory permission
      setCallerPermission(items, directoryPermission);
    } else {
      // Slow path: per-node permission calculation
      Array.map<T.NodeDetails, T.NodeDetails>(
        items,
        func(node) = { node with callerPermission = getCallerPermission(self.fs, caller, node) },
      );
    };

    // Enrich sharing info for managers only
    let enrichedEntries = if (directoryPermission == ?#ReadWriteManage) {
      enrichSharing(self.fs, entries);
    } else { entries };

    #ok({ entries = enrichedEntries; directoryPermission });
  };

  // Retrieves the list of users with rights for the specified entry
  public func listPermitted(self : T.StableStore, caller : Principal, entry : ?T.Entry) : async* Result.Result<[(Principal, T.PermissionExt)], Text> {
    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };
    let controllers = await* Permissions.getCanisterControllers(self.canisterId);
    Permissions.getSharedUserAccessForKey(self.fs, caller, findBy) |> Result.mapOk(
      _,
      func list = Array.map<(Principal, T.Permission), (Principal, T.PermissionExt)>(
        list,
        func(user, permission) = switch (
          Array.any(controllers, func(controller) = Principal.equal(user, controller))
        ) {
          case true (user, #Controller);
          case false (user, permission);
        },
      ),
    );
  };

  /// Generates a text representation of the file system tree
  public func showTree(self : T.StableStore, caller : T.Caller, entry : ?T.Entry) : Result.Result<Text, Text> {
    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };

    Permissions.ensureUserCanRead(self.fs, caller, findBy) |> Result.mapOk(_, func v = FileSystem.showTree(self.fs, entry));
  };

  /// Returns a hierarchical file system tree with only writable directories.
  /// For owner/manager: full directory tree.
  /// For shared users: only writable roots with their subtrees.
  public func fsTree(self : T.StableStore, caller : Principal) : Result.Result<[T.TreeNode], Text> {
    // Owner/manager can see full tree
    switch (Permissions.getMaxPermission(self.fs, caller, #root, null)) {
      case (?perm) if (not Order.isLess(Utils.permissionCompare(perm, #ReadWrite))) {
        return #ok(FileSystem.tree(self.fs, null));
      };
      case _ {};
    };

    // Shared user: find all nodes with direct Write+ permission, collect writable roots
    let writableRoots = Vector.new<T.NodeStore>();

    func isWritable(permission : T.Permission) : Bool {
      not Order.isLess(Utils.permissionCompare(permission, #ReadWrite));
    };

    func hasWritableAncestor(node : T.NodeStore) : Bool {
      switch (node.parentId) {
        case null false;
        case (?pid) {
          switch (Common.findNodeById(self.fs, pid)) {
            case (?parent) {
              switch (Permissions.getMaxPermission(self.fs, caller, #keyId(parent.keyId), null)) {
                case (?perm) if (isWritable(perm)) true else hasWritableAncestor(parent);
                case null hasWritableAncestor(parent);
              };
            };
            case null false;
          };
        };
      };
    };

    for (node in Map.vals(self.fs.nodes)) {
      switch (node.metadata) {
        case (#Directory _) {
          switch (Permissions.getMaxPermission(self.fs, caller, #keyId(node.keyId), null)) {
            case (?perm) {
              if (isWritable(perm) and not hasWritableAncestor(node)) {
                Vector.add(writableRoots, node);
              };
            };
            case null {};
          };
        };
        case _ {};
      };
    };

    // Build subtree for each writable root, including full path as name
    let result = Vector.new<T.TreeNode>();
    for (root in Vector.vals(writableRoots)) {
      let path = FileSystem.getEntryPath(self.fs, root);
      let subtree = FileSystem.tree(self.fs, ?root.id);
      Vector.add(result, { name = path; children = ?subtree });
    };

    #ok(Vector.toArray(result));
  };

  /// Retrieves the vetKD verification key for this canister.
  /// This key is used to verify the authenticity of derived vetKeys.
  public func getVetkeyVerificationKey(self : T.StableStore) : async T.VetKeyVerificationKey {
    await ManagementCanister.vetKdPublicKey(?self.canisterId, self.domainSeparatorBytes, self.vetKdKeyId);
  };

  /// Retrieves an encrypted vetKey for caller and key id.
  /// The vetKey is secured using the provided transport key and can only be accessed by authorized users.
  /// Returns an error if the caller is not authorized to access the vetKey.
  /// Validates vetkey access (sync) and returns the derivation input blob.
  /// Use this from the canister actor to avoid module-level async self-calls.
  public func validateVetkeyAccess(self : T.StableStore, caller : T.Caller, keyId : T.KeyId) : Result.Result<Blob, Text> {
    // Guard: reject VetKey requests for plaintext files
    switch (FileSystem.get(self.fs, #keyId(keyId))) {
      case (?{ metadata = #File(fileMeta) }) {
        if (fileMeta.encryptionMode == #Plaintext) {
          return #err(ErrorMessages.vetKeyNotAvailableForPlaintext());
        };
      };
      case _ {};
    };

    switch (Permissions.ensureUserCanRead(self.fs, caller, #keyId keyId)) {
      case (#err message) #err message;
      case (#ok _) {
        let principalBytes = Blob.toArray(Principal.toBlob(keyId.0));
        let input = Array.flatten<Nat8>([
          [Nat8.fromNat(Array.size<Nat8>(principalBytes))],
          principalBytes,
          Blob.toArray(keyId.1),
        ]);
        #ok(Blob.fromArray(input));
      };
    };
  };

  /// Legacy async version — kept for backward compatibility with example canister.
  public func getEncryptedVetkey(self : T.StableStore, caller : T.Caller, keyId : T.KeyId, transportKey : T.TransportKey) : async Result.Result<T.VetKey, Text> {
    switch (validateVetkeyAccess(self, caller, keyId)) {
      case (#err message) #err message;
      case (#ok input) {
        #ok(await ManagementCanister.vetKdDeriveKey(input, self.domainSeparatorBytes, self.vetKdKeyId, transportKey));
      };
    };
  };

  public func setThumbnail(self : T.StableStore, caller : T.Caller, args : T.SetThumbnailArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#err message) return #err message;
      case (#ok _) {};
    };

    FileSystem.setThumbnail(self.fs, args) |> Result.mapOk(_, Node.getDetails);
  };
};
