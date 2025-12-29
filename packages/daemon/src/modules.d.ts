declare module "*.sql" {
  var text: string;
  export = text;
}

declare module "*.dll" {
  var bin: any;
  export = bin;
}

declare module "*.dylib" {
  var bin: any;
  export = bin;
}

declare module "*.so" {
  var bin: any;
  export = bin;
}
