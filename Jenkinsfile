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
        // REGISTRY — "registry-vs" (no "staging-" prefix). The 2026-08-31
        // cutover happened: that name is now the permanent one for the new
        // estate (dev-np-quickstart.md item 38 is resolved — the registry's
        // token-issuer realm now matches, so np can pull from here directly).
        // "staging-registry-vs" was the pre-cutover name; don't revert to it.
        REGISTRY      = "registry-vs.m-society.go.th"
        PROJECT       = "root"
        APP_NAME      = "vcare-frontend"

        // IMAGE_NAME must stay "root/vcare-frontend" — no per-branch suffix.
        // GitLab's container registry only accepts a push into a repository
        // path that belongs to an existing project; "root/vcare-frontend-beta"
        // is not a project, so pushing there 401s as "insufficient_scope" (the
        // deploy token IS valid, it's just not scoped to a project that
        // doesn't exist). Measured 2026-08-29: Build Docker Image and Login
        // Registry succeeded, Push Image failed with exactly that error.
        // The "-beta" marker goes on the TAG instead (BRANCH_SUFFIX below),
        // which is unrestricted within an existing repo.
        IMAGE_NAME    = "${REGISTRY}/${PROJECT}/${APP_NAME}"
        IMAGE_TAG     = "${env.GIT_COMMIT?.take(8) ?: 'nogit'}-${env.BUILD_NUMBER}"

        // beta tags every image "-beta" suffixed so it never overwrites
        // production's :latest (and any other tag) in the shared repo above —
        // also used to look up the beta build-arg Secret further down.
        // vtn (training env, "อบรม") gets its own "-vtn" tag for the same
        // reason, and to look up its own build-arg Secret.
        BRANCH_SUFFIX = "${(env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('beta') ? '-beta' : (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('vtn') ? '-vtn' : ''}"

        // production-side cluster (172.21.103.x), ns vcare — used when NOT branch beta/vtn
        NAMESPACE     = "vcare"
        DEPLOYMENT    = "vcare-frontend"
        CONTAINER     = "vcare-frontend"
        KUBECONFIG    = "/var/lib/jenkins/.kube/config"

        // np/GDCC estate (192.168.10.x), ns staging — used only when branch beta/vtn.
        // See dev-np-quickstart.md §6.4 "Route C": np-agent01 is the only host
        // that can reach the np API server, so the deploy stage below runs on
        // the 'nonprod'-labelled agent, not here.
        //
        // vtn shares this same np cluster/ns staging with beta (same server,
        // per the vtn deploy decision) but its own Deployment name
        // "vcare-frontend-vtn" (deployment-vtn.yml), never "vcare-frontend"
        // (beta's/ops-owned) — hence the branch-conditional suffix here.
        NP_KUBECONFIG = "/var/lib/jenkins-agent/.kube/config"
        NP_NAMESPACE  = "staging"
        NP_DEPLOYMENT = "vcare-frontend${(env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('vtn') ? '-vtn' : ''}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Stash np Manifests') {
            // node('nonprod') below opens its own workspace on np-agent01,
            // separate from the one Checkout just cloned into on the default
            // agent — files aren't shared between them automatically.
            //
            // vtn shares this same np cluster/ns staging with beta — its own
            // deployment-vtn.yml is stashed alongside beta's rather than in a
            // separate stage, since both branches need this stage's stash name.
            when {
                anyOf {
                    expression { return (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('beta') }
                    expression { return (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('vtn') }
                }
            }
            steps {
                stash name: 'np-manifests', includes: 'hpa-np.yml,deployment-beta.yml,deployment-vtn.yml'
            }
        }

        stage('Read Beta Build Args') {
            // The build-arg Secret for beta now lives in ns staging on np, not ns
            // vcare — only the nonprod-labelled agent (np-agent01) can reach that
            // API server (dev-np-quickstart.md §6.4), but it has no docker
            // (purged — item 14), so the values are read here and handed to the
            // 'Build Docker Image' stage below via stash, which runs docker build
            // on the default agent instead.
            //
            // This Secret is NOT created by this pipeline (unlike betabackcred):
            // it must already exist in ns staging on np, e.g. by applying the
            // same content as vsmartcare_frontend/secrets-beta.yml there once
            // (that file is gitignored and only ever applied by hand — see the
            // ns vcare equivalent this mirrors). If it's missing, this stage
            // will fail on the kubectl get, not silently build with blank values.
            when {
                expression { return (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('beta') }
            }
            steps {
                node('nonprod') {
                    withEnv(["KUBECONFIG=${NP_KUBECONFIG}"]) {
                        sh '''
                            set -eu
                            SECRET_NAME="vcare-frontend-secret${BRANCH_SUFFIX}"

                            kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} >/dev/null

                            {
                                echo "VITE_API_URL=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_API_URL}' | base64 -d)"
                                echo "VITE_BFF_API_KEY=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_BFF_API_KEY}' | base64 -d)"
                                echo "VITE_OCR_API_URL=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_OCR_API_URL}' | base64 -d)"
                                echo "VITE_LOGIN_BETA_NOTICE=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_LOGIN_BETA_NOTICE}' | base64 -d)"
                            } > beta-build-args.env
                        '''
                        stash name: 'beta-build-args', includes: 'beta-build-args.env'
                    }
                }
            }
        }

        stage('Read vtn Build Args') {
            // Same reasoning as "Read Beta Build Args" above, but for vtn's own
            // Secret (vcare-frontend-secret-vtn) — VITE_API_URL here must point
            // at the vtn backend (bff-vsmartcare-vtn), not production's or
            // beta's, or the training frontend would call the wrong backend.
            //
            // Not created by this pipeline: must already exist in ns staging on
            // np, applied by hand once (own file, gitignored, never commit real
            // values — see secrets-beta.yml for the pattern this mirrors).
            when {
                expression { return (env.BRANCH_NAME ?: env.GIT_BRANCH ?: '').contains('vtn') }
            }
            steps {
                node('nonprod') {
                    withEnv(["KUBECONFIG=${NP_KUBECONFIG}"]) {
                        sh '''
                            set -eu
                            SECRET_NAME="vcare-frontend-secret${BRANCH_SUFFIX}"

                            kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} >/dev/null

                            {
                                echo "VITE_API_URL=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_API_URL}' | base64 -d)"
                                echo "VITE_BFF_API_KEY=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_BFF_API_KEY}' | base64 -d)"
                                echo "VITE_OCR_API_URL=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_OCR_API_URL}' | base64 -d)"
                                echo "VITE_LOGIN_BETA_NOTICE=$(kubectl -n ${NP_NAMESPACE} get secret ${SECRET_NAME} -o jsonpath='{.data.VITE_LOGIN_BETA_NOTICE}' | base64 -d)"
                            } > vtn-build-args.env
                        '''
                        stash name: 'vtn-build-args', includes: 'vtn-build-args.env'
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    if (branchName.contains('vtn')) {
                        unstash 'vtn-build-args'
                        sh '''
                            set -a
                            . ./vtn-build-args.env
                            set +a
                            rm -f vtn-build-args.env

                            docker build \
                                --build-arg VITE_API_URL="$VITE_API_URL" \
                                --build-arg VITE_BFF_API_KEY="$VITE_BFF_API_KEY" \
                                --build-arg VITE_OCR_API_URL="$VITE_OCR_API_URL" \
                                --build-arg VITE_LOGIN_BETA_NOTICE="$VITE_LOGIN_BETA_NOTICE" \
                                -t ${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX} \
                                -t ${IMAGE_NAME}:latest${BRANCH_SUFFIX} .
                        '''
                    } else if (branchName.contains('beta')) {
                        unstash 'beta-build-args'
                        sh '''
                            set -a
                            . ./beta-build-args.env
                            set +a
                            rm -f beta-build-args.env

                            docker build \
                                --build-arg VITE_API_URL="$VITE_API_URL" \
                                --build-arg VITE_BFF_API_KEY="$VITE_BFF_API_KEY" \
                                --build-arg VITE_OCR_API_URL="$VITE_OCR_API_URL" \
                                --build-arg VITE_LOGIN_BETA_NOTICE="$VITE_LOGIN_BETA_NOTICE" \
                                -t ${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX} \
                                -t ${IMAGE_NAME}:latest${BRANCH_SUFFIX} .
                        '''
                    } else {
                        sh '''
                            export KUBECONFIG=${KUBECONFIG}

                            SECRET_NAME="vcare-frontend-secret"

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
                                -t ${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX} \
                                -t ${IMAGE_NAME}:latest${BRANCH_SUFFIX} .
                        '''
                    }
                }
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
                    docker push ${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX}
                    docker push ${IMAGE_NAME}:latest${BRANCH_SUFFIX}
                '''
            }
        }

        stage('Deploy Kubernetes') {
            steps {
                script {
                    def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    if (branchName.contains('vtn')) {
                        // Same np/GDCC estate as beta below, own Deployment
                        // "vcare-frontend-vtn" (see deployment-vtn.yml, applied by
                        // this stage every run, same as beta's deployment-beta.yml
                        // below). Own pull secret "vtnbackcred" instead of reusing
                        // "betabackcred" so a vtn deploy doesn't depend on a beta
                        // build having run first on this Jenkins instance.
                        node('nonprod') {
                            unstash 'np-manifests'
                            withEnv(["KUBECONFIG=${NP_KUBECONFIG}"]) {
                                // Jenkins now owns this Deployment instead of requiring a
                                // one-time hand-applied `kubectl apply -f deployment-vtn.yml`
                                // — idempotent, safe to re-apply every vtn run. Must run
                                // before the imagePullSecrets patch below, which would fail
                                // if the Deployment didn't exist yet.
                                sh '''
                                    kubectl -n ${NP_NAMESPACE} apply -f deployment-vtn.yml
                                '''

                                withCredentials([
                                    usernamePassword(
                                        credentialsId: 'devop-bot',
                                        usernameVariable: 'REGISTRY_USER',
                                        passwordVariable: 'REGISTRY_PASS'
                                    )
                                ]) {
                                    sh '''
                                        kubectl -n ${NP_NAMESPACE} create secret docker-registry vtnbackcred \
                                            --docker-server=${REGISTRY} \
                                            --docker-username="$REGISTRY_USER" \
                                            --docker-password="$REGISTRY_PASS" \
                                            --dry-run=client -o yaml | kubectl apply -f -

                                        kubectl -n ${NP_NAMESPACE} patch deployment ${NP_DEPLOYMENT} --type=json -p \
                                            '[{"op":"add","path":"/spec/template/spec/imagePullSecrets","value":[{"name":"regcred"},{"name":"regcred-staging"},{"name":"vtnbackcred"}]}]'
                                    '''
                                }

                                sh '''
                                    kubectl -n ${NP_NAMESPACE} set image deployment/${NP_DEPLOYMENT} \
                                        '*'=${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX}

                                    if ! kubectl -n ${NP_NAMESPACE} rollout status deployment/${NP_DEPLOYMENT} --timeout=600s; then
                                        echo "--- rollout failed, describing ---"
                                        kubectl -n ${NP_NAMESPACE} describe deployment/${NP_DEPLOYMENT}
                                        kubectl -n ${NP_NAMESPACE} get pods -o wide -l app=${NP_DEPLOYMENT}
                                        kubectl -n ${NP_NAMESPACE} get events --sort-by=.lastTimestamp | tail -30
                                        exit 1
                                    fi
                                '''
                            }
                        }
                    } else if (branchName.contains('beta')) {
                        // Deploy to the np/GDCC estate instead of ns vcare — see
                        // dev-np-quickstart.md §6.4 "Route C". Runs on the
                        // nonprod-labelled agent (np-agent01) because prod
                        // Jenkins has no network route into 192.168.10.0/24;
                        // that agent dials out to us instead. np-agent01 has
                        // no docker (purged — item 14 in the doc), which is
                        // why only this kubectl-only stage moves agents; the
                        // build/push stages above still ran on the default one.
                        //
                        // The Deployment (vcare-frontend, ns staging) and its
                        // Service already exist on np, created/managed by ops
                        // — this stage only updates the image. '*' matches
                        // whatever the single container in that pod spec is
                        // named, since it isn't confirmed from this repo.
                        //
                        // Pull secret: ensure "betabackcred" exists in ns staging
                        // and is wired into the Deployment. Built from the same
                        // 'devop-bot' credential the Push Image stage already
                        // logs in with (server=REGISTRY), so there's no separate
                        // token to keep in sync by hand — every run refreshes it,
                        // which also self-heals if the credential is ever rotated.
                        // regcred/regcred-staging are kept alongside it rather
                        // than replaced: regcred is the only thing that can still
                        // pull the digest-pinned kitsune-cop image if this pod
                        // ever needs to fall back to it (dev-np-quickstart.md
                        // item 4), and the kubelet just tries each secret in turn.
                        node('nonprod') {
                            unstash 'np-manifests'
                            withEnv(["KUBECONFIG=${NP_KUBECONFIG}"]) {
                                // Jenkins now owns this Deployment instead of requiring a
                                // one-time hand-applied `kubectl apply -f deployment-beta.yml`
                                // — idempotent, safe to re-apply every beta run. Must run
                                // before the imagePullSecrets patch below, which would fail
                                // if the Deployment didn't exist yet.
                                //
                                // Note: deployment-beta.yml's image field is the static
                                // "latest-beta" tag, not the per-build tag set below — this
                                // briefly reverts the image before `set image` overwrites it
                                // seconds later, same accepted tradeoff as the backend's
                                // equivalent stage.
                                sh '''
                                    kubectl -n ${NP_NAMESPACE} apply -f deployment-beta.yml
                                    kubectl -n ${NP_NAMESPACE} apply -f hpa-np.yml
                                    kubectl -n ${NP_NAMESPACE} get hpa
                                '''

                                withCredentials([
                                    usernamePassword(
                                        credentialsId: 'devop-bot',
                                        usernameVariable: 'REGISTRY_USER',
                                        passwordVariable: 'REGISTRY_PASS'
                                    )
                                ]) {
                                    sh '''
                                        kubectl -n ${NP_NAMESPACE} create secret docker-registry betabackcred \
                                            --docker-server=${REGISTRY} \
                                            --docker-username="$REGISTRY_USER" \
                                            --docker-password="$REGISTRY_PASS" \
                                            --dry-run=client -o yaml | kubectl apply -f -

                                        kubectl -n ${NP_NAMESPACE} patch deployment ${NP_DEPLOYMENT} --type=json -p \
                                            '[{"op":"add","path":"/spec/template/spec/imagePullSecrets","value":[{"name":"regcred"},{"name":"regcred-staging"},{"name":"betabackcred"}]}]'
                                    '''
                                }

                                sh '''
                                    kubectl -n ${NP_NAMESPACE} set image deployment/${NP_DEPLOYMENT} \
                                        '*'=${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX}

                                    if ! kubectl -n ${NP_NAMESPACE} rollout status deployment/${NP_DEPLOYMENT} --timeout=600s; then
                                        echo "--- rollout failed, describing ---"
                                        kubectl -n ${NP_NAMESPACE} describe deployment/${NP_DEPLOYMENT}
                                        kubectl -n ${NP_NAMESPACE} get pods -o wide -l app=vcare-frontend
                                        # check for ImagePullBackOff first, then app-level crash/config issues
                                        kubectl -n ${NP_NAMESPACE} get events --sort-by=.lastTimestamp | tail -30
                                        exit 1
                                    fi
                                '''
                            }
                        }
                    } else {
                        // Bake the real build tag into deployment.yml before applying instead of
                        // apply-then-set-image: the old two-step sequence wrote to the same
                        // Deployment object twice (once reverting the image to :latest via apply,
                        // once forward to the real tag via set image) a few seconds apart — each
                        // write needs the same etcd fsync round-trip, so on a control plane with
                        // slow disk I/O this doubled the exposure to "spec update not observed"
                        // stalls for no functional benefit. One substituted apply == one write.
                        sh '''
                            export KUBECONFIG=${KUBECONFIG}

                            sed "s#image: ${IMAGE_NAME}:latest#image: ${IMAGE_NAME}:${IMAGE_TAG}${BRANCH_SUFFIX}#" \
                                deployment.yml > deployment.rendered.yml

                            kubectl apply -f deployment.rendered.yml
                            kubectl apply -f service.yml
                            kubectl apply -f hpa.yml

                            kubectl -n ${NAMESPACE} rollout status deployment/${DEPLOYMENT} --timeout=600s
                        '''
                    }
                }
            }
        }

        stage('Verify') {
            steps {
                script {
                    def branchName = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    if (branchName.contains('vtn') || branchName.contains('beta')) {
                        node('nonprod') {
                            withEnv(["KUBECONFIG=${NP_KUBECONFIG}"]) {
                                sh '''
                                    kubectl -n ${NP_NAMESPACE} get deployment ${NP_DEPLOYMENT}
                                    kubectl -n ${NP_NAMESPACE} get pods -o wide -l app=${NP_DEPLOYMENT}
                                '''
                            }
                        }
                    } else {
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
            echo " Image : ${env.IMAGE_NAME}:${env.IMAGE_TAG}${env.BRANCH_SUFFIX}"
            echo "======================================"
        }

        failure {
            echo "======================================"
            echo " Deploy Failed"
            echo "======================================"
        }
    }
}
