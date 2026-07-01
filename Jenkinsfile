pipeline {

    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(
            numToKeepStr: '20',
            artifactNumToKeepStr: '10'
        ))
    }

    environment {
        REGISTRY      = "registry-vs.m-society.go.th"
        PROJECT       = "kitsune-cop"
        APP_NAME      = "vcare-frontend"

        IMAGE_NAME    = "${REGISTRY}/${PROJECT}/${APP_NAME}"
        IMAGE_TAG     = "${env.GIT_COMMIT?.take(8) ?: env.BUILD_NUMBER}"

        NAMESPACE     = "vcare"
        DEPLOYMENT    = "vcare-frontend"
        CONTAINER     = "vcare-frontend"

        KUBECONFIG    = "/var/lib/jenkins/.kube/config"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    docker build \
                        -t ${IMAGE_NAME}:${IMAGE_TAG} \
                        -t ${IMAGE_NAME}:latest .
                '''
            }
        }

        stage('Login Registry') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'devop-bot',
                        usernameVariable: 'REGISTRY_USER',
                        passwordVariable: 'REGISTRY_PASS'
                    )
                ]) {

                    sh '''
                        echo "$REGISTRY_PASS" | docker login ${REGISTRY} \
                            -u "$REGISTRY_USER" \
                            --password-stdin
                    '''
                }
            }
        }

        stage('Push Image') {
            steps {
                sh '''
                    docker push ${IMAGE_NAME}:${IMAGE_TAG}
                    docker push ${IMAGE_NAME}:latest
                '''
            }
        }

        stage('Deploy Kubernetes') {
            steps {
                sh '''
                    export KUBECONFIG=${KUBECONFIG}

                    kubectl apply -f deployment.yml
                    kubectl apply -f service.yml
                    kubectl apply -f hpa.yml

                    kubectl -n ${NAMESPACE} set image deployment/${DEPLOYMENT} \
                        ${CONTAINER}=${IMAGE_NAME}:${IMAGE_TAG}

                    kubectl -n ${NAMESPACE} rollout status deployment/${DEPLOYMENT} --timeout=300s
                '''
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    export KUBECONFIG=${KUBECONFIG}

                    kubectl -n ${NAMESPACE} get deployment
                    kubectl -n ${NAMESPACE} get pods -o wide
                    kubectl -n ${NAMESPACE} get svc
                    kubectl -n ${NAMESPACE} get hpa
                '''
            }
        }
    }

    post {

        always {

            sh '''
                docker logout ${REGISTRY} || true
                docker image prune -f || true
            '''

            cleanWs()
        }

        success {
            echo "======================================"
            echo " Deploy Success"
            echo " Image : ${IMAGE_NAME}:${IMAGE_TAG}"
            echo "======================================"
        }

        failure {
            echo "======================================"
            echo " Deploy Failed"
            echo "======================================"
        }
    }
}