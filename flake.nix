{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          default = pkgs.buildNpmPackage {
            pname = "fadumper";
            version = "1.0.0";
            src = ./.;
            npmDepsHash = "sha256-r6Xf2Bjsx9zYge9Vw3vufkK41f5F7GMLc1/x6NpL6QE=";
          };
        };
      });
}
