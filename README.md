# link-install

#### Overview
A package that will resolve local dependencies in a package.json and install them correctly without the need of publishing the local dependencies to npm.

#### Installation

```
npm i -g link-install
```

#### Usage

Just specify the location of your package.json file. You can optionally pass in npm install options

```
link install [directory] [options]
```

Eg.

```
link install app --production --no-optional
```
