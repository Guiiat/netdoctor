export interface PresetTarget {
  readonly url: string;
  readonly label: string;
  readonly expectedStatuses?: readonly number[];
}

export interface Preset {
  readonly name: string;
  readonly description: string;
  readonly targets: readonly PresetTarget[];
}

export const PRESETS: Readonly<Record<string, Preset>> = {
  github: {
    name: "github",
    description: "GitHub website, REST API, and release asset delivery",
    targets: [
      { url: "https://github.com/", label: "GitHub Web" },
      { url: "https://api.github.com/", label: "GitHub API" },
      {
        url: "https://objects.githubusercontent.com/",
        label: "GitHub Objects",
        expectedStatuses: [404],
      },
    ],
  },
  npm: {
    name: "npm",
    description: "npm registry and website",
    targets: [
      { url: "https://registry.npmjs.org/-/ping", label: "npm Registry" },
      { url: "https://www.npmjs.com/", label: "npm Website" },
    ],
  },
  pypi: {
    name: "pypi",
    description: "Python package index and package file delivery",
    targets: [
      { url: "https://pypi.org/pypi/pip/json", label: "PyPI API" },
      {
        url: "https://files.pythonhosted.org/",
        label: "Python Package Files",
        expectedStatuses: [200, 404],
      },
    ],
  },
  docker: {
    name: "docker",
    description: "Docker Hub registry and authentication service",
    targets: [
      {
        url: "https://registry-1.docker.io/v2/",
        label: "Docker Registry",
        expectedStatuses: [401],
      },
      {
        url: "https://auth.docker.io/",
        label: "Docker Authentication",
        expectedStatuses: [200, 404],
      },
    ],
  },
};

export const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));
