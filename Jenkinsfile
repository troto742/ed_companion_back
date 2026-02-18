pipeline {
  agent any

  environment {
    REGISTRY_URL        = 'docker.io'
    FULL_IMAGE          = 'troto742/ed_companion-back:latest'
    REGISTRY_CREDENTIAL = 'docker-registry-creds'
    DEPLOY_CREDENTIAL   = 'deploy-server-ssh'
    DEPLOY_HOST         = 'root@vmi2418300'
    DEPLOY_PATH         = '/root/docker-compose-ED_companion'
    SERVICE_NAME        = 'backend'
  }

  stages {
    stage('Build Docker Image') {
      steps {
        sh "docker build -t ${FULL_IMAGE} -f backend/Dockerfile backend"
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
