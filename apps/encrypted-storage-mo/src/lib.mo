import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Principal "mo:core/Principal";
import Order "mo:core/Order";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Nat8 "mo:core/Nat8";
import D "mo:core/Debug";

import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import Vector "mo:vector";
import CertifiedAssets "mo:certified-assets/Stable";

import T "Types";
import Utils "Utils";
import FileSystem "FileSystem";
import Upload "Upload";
import ErrorMessages "ErrorMessages";
import File "FileSystem/File";
import Node "FileSystem/Node";
import Permissions "FileSystem/Permissions";
import Const "Const";
import Http "Http";

module EncryptedFileStorage {
  public type StableStore = T.StableStore;

  /// Create a new stable EncryptedStorage instance on the heap.
  /// This instance is stable and will not be cleared on canister upgrade.
  ///
  /// Example:
  /// ```motoko
  /// let keyId : ManagementCanister.VetKdKeyid = {
  ///   curve = #bls12_381_g2;
  ///   name = "dfx_test_key";
  /// };
  /// let canisterId = Principal.fromActor(this);
  /// let storage = EncryptedStorage.new({
  ///   canisterId;
  ///   vetKdKeyId = keyId;
  ///   domainSeparator = "file_storage_dapp";
  ///   region = MemoryRegion.new();
  ///   rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
  /// });
  /// ```
  public func new({ region; rootPermissions; canisterId; vetKdKeyId; domainSeparator; certs } : T.EncryptedStorageInitArgs) : T.StableStore {
    let fs = FileSystem.new({
      region;
      rootPermissions;
    });
    let upload = Upload.new(region);

    {
      canisterId;
      region;
      fs;
      upload;
      certs = Option.get(certs, CertifiedAssets.init_stable_store());
      vetKdKeyId;
      domainSeparatorBytes = Text.encodeUtf8(domainSeparator);
      var streamingCallback = null;
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
        let numChunks = File.getChunksSize(file);

        if (args.chunkIndex >= numChunks) return #err("Chunk index out of bounds.");

        File.getChunk(self.fs, file, args.chunkIndex) |> #ok({
          content = Option.get<Blob>(_, "");
        });
      };
      case _ #err(ErrorMessages.entryNotFound(args.entry));
    };
  };

  func endpoint(keyId : T.KeyId, hash : Blob) : CertifiedAssets.Endpoint {
    let ?tid = Text.decodeUtf8(keyId.1) else Runtime.unreachable();
    let key = "/" # Text.join("/", Iter.fromArray(["encrypted", Principal.toText(keyId.0), tid]));
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

  /// Creates a file or directory using the specified path, if the path does not exist, it also creates all parent directories.
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.create(storage, caller, { entry = #File("dir/subdir/file.jpg") });
  /// switch (result) {
  ///   case (#ok node) {
  ///     // the `node` variable is of type T.NodeStore and contains information about the created node `file.jpg `
  ///   };
  ///   case (#err message) return #err message;
  /// };
  /// ```
  public func create(self : T.StableStore, caller : Principal, args : T.CreateArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    FileSystem.create(self.fs, caller, args) |> Result.mapOk<T.NodeStore, T.NodeDetails, Text>(_, Node.getDetails);
  };

  /// Updates data for a file or directory.
  /// To fully upload the file, follow these steps:
  /// 1. Create a file using the `create` method.
  /// 2. Create a batch file using `createBatch` and upload all chunks from the file using `createChunk`.
  /// 3. Complete the upload process by calling `update`.
  public func update(self : T.StableStore, caller : Principal, args : T.UpdateArguments) : async* Result.Result<(), Text> {
    let entry = switch (args) {
      case (#File { path }) (#File, path);
      case (#Directory { path }) (#Directory, path);
    };
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };
    let ?node = FileSystem.get(self.fs, #entry(entry)) else return #err(ErrorMessages.entryNotFound(entry));

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

        File.deallocate(self.fs, file);

        let chunks = Iter.map<T.SizedPointer, Blob>(
          chunkPointers.vals(),
          func(address : Nat, size : Nat) : Blob = MemoryRegion.loadBlob(self.fs.region, address, size),
        );

        File.replaceContentViaChunks(self.fs, file, chunks, totalLength, hash);
        file.contentType := contentType;
        CertifiedAssets.certify(self.certs, endpoint(keyId, hash));
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
      case (#ok(?{ metadata = #File(file) })) File.deallocate(self.fs, file);
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
  public func createBatch(self : T.StableStore, caller : Principal, args : T.CreateArguments) : Result.Result<T.CreateBatchResponse, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    Upload.createBatch(self.upload);
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
  public func createChunk(self : T.StableStore, args : T.Chunk) : Result.Result<T.CreateChunkResponse, Text> {
    Upload.createChunk(self.upload, args);
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

  /// Clears the current storage
  public func clear(self : T.StableStore, caller : Principal) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #root)) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    FileSystem.clear(self.fs);
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
  public func grantPermission(self : T.StableStore, caller : T.Caller, args : T.GrantPermissionArguments) : Result.Result<(), Text> {
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

  /// Returns a list of directories and files by the specified entry.
  /// If the user does not have the right to read the directory, it returns an array with the elements to which the user has the right to read.
  public func list(self : T.StableStore, caller : Principal, entry : ?T.Entry) : Result.Result<[T.NodeDetails], Text> {
    let canRead = switch (FileSystem.getFilterByFromEntry(self.fs, entry)) {
      case (#ok v) Permissions.ensureUserCanRead(self.fs, caller, v) |> Result.isOk(_);
      case (#err message) return #err message;
    };

    let parentId = switch (entry) {
      case (?v) {
        let ?{ id } = FileSystem.get(self.fs, #entry(v)) else return #ok([]);
        ?id;
      };
      case null null;
    };
    let items = FileSystem.listByParentId(self.fs, parentId) |> Array.map(_, Node.getDetails);

    if (not canRead) {
      return Array.filter(
        items,
        func(node) {
          let nodeKey : T.NodeKey = switch (node) {
            case ({ metadata = #File(_) }) (#File, node.parentId, node.name);
            case ({ metadata = #Directory(_) }) (#Directory, node.parentId, node.name);
          };
          Permissions.ensureUserCanRead(self.fs, caller, #nodeKey(nodeKey)) |> Result.isOk(_);
        },
      ) |> #ok(_);
    };

    #ok(items);
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

  /// Returns a hierarchical file system tree
  public func fsTree(self : T.StableStore, caller : Principal) : Result.Result<[T.TreeNode], Text> {
    Permissions.ensureUserCanRead(self.fs, caller, #root) |> Result.mapOk(_, func v = FileSystem.tree(self.fs, null));
  };

  /// Retrieves the vetKD verification key for this canister.
  /// This key is used to verify the authenticity of derived vetKeys.
  public func getVetkeyVerificationKey(self : T.StableStore) : async T.VetKeyVerificationKey {
    await ManagementCanister.vetKdPublicKey(?self.canisterId, self.domainSeparatorBytes, self.vetKdKeyId);
  };

  /// Retrieves an encrypted vetKey for caller and key id.
  /// The vetKey is secured using the provided transport key and can only be accessed by authorized users.
  /// Returns an error if the caller is not authorized to access the vetKey.
  public func getEncryptedVetkey(self : T.StableStore, caller : T.Caller, keyId : T.KeyId, transportKey : T.TransportKey) : async Result.Result<T.VetKey, Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #keyId keyId)) {
      case (#err message) #err message;
      case (#ok _) {
        let principalBytes = Blob.toArray(Principal.toBlob(keyId.0));
        let input = Array.flatten<Nat8>([
          [Nat8.fromNat(Array.size<Nat8>(principalBytes))],
          principalBytes,
          Blob.toArray(keyId.1),
        ]);

        #ok(await ManagementCanister.vetKdDeriveKey(Blob.fromArray(input), self.domainSeparatorBytes, self.vetKdKeyId, transportKey));
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
