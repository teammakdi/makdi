# Makdi | Crawler


## Installation

```bash
docker-compose up --build
```

## Pushing to DockerHub

[Github action](https://github.com/teammakdi/makdi/actions) is set to publish image to the [dockerhub](https://hub.docker.com/repository/docker/teammakdi/makdi/tags?page=1&ordering=last_updated).

To push manually, execute the following

```bash
docker build -f Dockerfile . -t teammakdi/makdi:latest --platform=linux/amd64
```

```bash
docker push teammakdi/makdi:latest
```