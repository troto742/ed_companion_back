pipeline {
  agent any

  // Configura el destino y crea las credenciales referenciadas en Jenkins.
  environment {
    REGISTRY_URL        = 'docker.io'
    FULL_IMAGE          = 'troto742/ed_companion-back:latest'
    REGISTRY_CREDENTIAL = 'docker-registry-creds'
    DEPLOY_CREDENTIAL   = 'deploy-server-ssh'
    DEPLOY_HOST         = 'REEMPLAZAR_USUARIO@REEMPLAZAR_HOST'
    DEPLOY_PATH         = '/REEMPLAZAR_RUTA_DEL_DESPLIEGUE'
    SERVICE_NAME        = 'backend'
  }

  stages {
    stage('Build Docker Image') {
      steps {
        script {
          def dockerContext = fileExists('Dockerfile') ? '.' : 'backend'
          def dockerfilePath = fileExists('Dockerfile') ? 'Dockerfile' : 'backend/Dockerfile'

          sh "docker build -t ${FULL_IMAGE} -f ${dockerfilePath} ${dockerContext}"
        }
      }
    }

    stage('Push Image to DockerHub') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: REGISTRY_CREDENTIAL,
          usernameVariable: 'USER',
          passwordVariable: 'PASS'
        )]) {
          sh """
            echo "$PASS" | docker login -u "$USER" --password-stdin ${REGISTRY_URL}
            docker push ${FULL_IMAGE}
            docker logout ${REGISTRY_URL}
          """
        }
      }
    }

    stage('Deploy Backend') {
      steps {
        sshagent(credentials: [DEPLOY_CREDENTIAL]) {
          sh """
            ssh -o StrictHostKeyChecking=no ${DEPLOY_HOST} '
              set -e
              cd ${DEPLOY_PATH}
              docker compose pull ${SERVICE_NAME}
              docker compose up -d --no-deps ${SERVICE_NAME}
              docker image prune -f
            '
          """
        }
      }
    }
  }

  post {
    success { echo "Deploy backend completado -> ${FULL_IMAGE}" }
    failure { echo "Error en pipeline backend -> revisar logs" }
  }
}
