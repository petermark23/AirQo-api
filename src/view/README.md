# Running the application

## Using Command line

### Exposing the API

Generate the API docs

```bash
./mvnw package
```

Spin up the API

```bash
./mvnw spring-boot:run
```

[Link to API Docs](http://localhost:8080/api/v1/view/docs/index.html)

#### Insights

## Using Docker Compose

### Start containers

```bash
sh setup/run.sh  
```

## Using Docker compose

### Stop containers

```bash
Ctrl + c
```

### Cleanup

```bash
sh clean.sh  
```

## Useful commands

```bash
./mvnw compile
```
