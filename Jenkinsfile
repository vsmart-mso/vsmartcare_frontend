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
        REGISTRY      = "staging-registry-vs.m-society.go.th"
        PROJECT       = "root"
        APP_NAME      = "vcare-frontend"
        // beta builds and deploys under a "-beta" suffixed name so they never overwrite another branch's image/service
        BRANCH_SUFFIX = "${(env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('beta') ? '-beta' : ''}"

        IMAGE_NAME    = "${REGISTRY}/${PROJECT}/${APP_NAME}${BRANCH_SUFFIX}"
        IMAGE_TAG     = "${env.GIT_COMMIT?.take(8) ?: env.BUILD_NUMBER}"

        NAMESPACE     = "vcare"
        DEPLOYMENT    = "vcare-frontend${BRANCH_SUFFIX}"
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
                    export KUBECONFIG=${KUBECONFIG}

                    SECRET_NAME="vcare-frontend-secret${BRANCH_SUFFIX}"

                    VITE_API_URL=$(kubectl -n ${NAMESPACE} get secret ${SECRET_NAME} \
                        -o jsonpath='{.data.VITE_API_URL}' | base64 -d)
                    VITE_BFF_API_KEY=$(kubectl -n ${NAMESPACE} get secret ${SECRET_NAME} \
                        -o jsonpath='{.data.VITE_BFF_API_KEY}' | base64 -d)
                    VITE_OCR_API_URL=$(kubectl -n ${NAMESPACE} get secret ${SECRET_NAME} \
                        -o jsonpath='{.data.VITE_OCR_API_URL}' | base64 -d)
                    VITE_LOGIN_BETA_NOTICE=$(kubectl -n ${NAMESPACE} get secret ${SECRET_NAME} \
                        -o jsonpath='{.data.VITE_LOGIN_BETA_NOTICE}' | base64 -d)

                    docker build \
                        --build-arg VITE_API_URL="$VITE_API_URL" \
                        --build-arg VITE_BFF_API_KEY="$VITE_BFF_API_KEY" \
                        --build-arg VITE_OCR_API_URL="$VITE_OCR_API_URL" \
                        --build-arg VITE_LOGIN_BETA_NOTICE="$VITE_LOGIN_BETA_NOTICE" \
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
                script {
                    def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    if (branchName.contains('beta')) {
                        // beta deploys its own dedicated manifests (separate name/app-label/nodePort from production)
                        // and runs without HPA/autoscaling; remove any HPA left over from a previous deploy
                        sh '''
                            export KUBECONFIG=${KUBECONFIG}

                            kubectl apply -f deployment-beta.yml
                            kubectl apply -f service-beta.yml
                            kubectl -n ${NAMESPACE} delete hpa vcare-frontend --ignore-not-found=true
                        '''
                    } else {
                        sh '''
                            export KUBECONFIG=${KUBECONFIG}

                            kubectl apply -f deployment.yml
                            kubectl apply -f service.yml
                            kubectl apply -f hpa.yml
                        '''
                    }
                }
                sh '''
                    export KUBECONFIG=${KUBECONFIG}

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